package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"reflect"
	"strings"
	"time"
)

// Captured once at startup from the deployment owner. The locator is transport,
// not another author; absent, partial and ambiguous policies never get defaults.
type controllerPolicy struct {
	HTTPClientTimeoutSeconds              int64 `json:"httpClientTimeoutSeconds"`
	ReadyReadHeaderTimeoutSeconds         int64 `json:"readyReadHeaderTimeoutSeconds"`
	ReadyReadTimeoutSeconds               int64 `json:"readyReadTimeoutSeconds"`
	ReadyWriteTimeoutSeconds              int64 `json:"readyWriteTimeoutSeconds"`
	ReadyIdleTimeoutSeconds               int64 `json:"readyIdleTimeoutSeconds"`
	ReadyMaxHeaderBytes                   int64 `json:"readyMaxHeaderBytes"`
	ReadyHandlerTimeoutSeconds            int64 `json:"readyHandlerTimeoutSeconds"`
	ReadyMaximumBodyBytes                 int64 `json:"readyMaximumBodyBytes"`
	DefaultDemoRetentionSeconds           int64 `json:"defaultDemoRetentionSeconds"`
	AuthorizationMaximumBytes             int64 `json:"authorizationMaximumBytes"`
	ReadyObservationMaximumAgeSeconds     int64 `json:"readyObservationMaximumAgeSeconds"`
	ProductHandlerTimeoutSeconds          int64 `json:"productHandlerTimeoutSeconds"`
	ProductMaximumBodyBytes               int64 `json:"productMaximumBodyBytes"`
	ProductDecisionMaximumValiditySeconds int64 `json:"productDecisionMaximumValiditySeconds"`
}

func loadControllerPolicy(file string) (controllerPolicy, error) {
	var policy controllerPolicy
	if file == "" {
		return policy, errors.New("CONTROLLER_POLICY_LOCATOR_REQUIRED")
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		return policy, err
	}
	return decodeControllerPolicy(raw)
}

func decodeControllerPolicy(raw []byte) (controllerPolicy, error) {
	var policy controllerPolicy
	invalid := errors.New("CONTROLLER_POLICY_INVALID")
	decoder := json.NewDecoder(bytes.NewReader(raw))
	token, err := decoder.Token()
	if err != nil || token != json.Delim('{') {
		return policy, invalid
	}
	value := reflect.ValueOf(&policy).Elem()
	fields := map[string]int{}
	for i := 0; i < value.NumField(); i++ {
		fields[value.Type().Field(i).Tag.Get("json")] = i
	}
	seen := map[string]bool{}
	for decoder.More() {
		token, err = decoder.Token()
		key, ok := token.(string)
		index, known := fields[key]
		if err != nil || !ok || !known || seen[key] {
			return controllerPolicy{}, invalid
		}
		seen[key] = true
		var number int64
		if decoder.Decode(&number) != nil || number < 1 {
			return controllerPolicy{}, invalid
		}
		maximum := int64(9007199254740991)
		if strings.HasSuffix(key, "Seconds") {
			maximum = int64((1<<63 - 1) / time.Second)
		} else if int64(int(^uint(0)>>1)) < maximum {
			maximum = int64(int(^uint(0) >> 1))
		}
		if number > maximum {
			return controllerPolicy{}, invalid
		}
		value.Field(index).SetInt(number)
	}
	token, err = decoder.Token()
	if err != nil || token != json.Delim('}') || len(seen) != len(fields) || decoder.Decode(new(interface{})) != io.EOF {
		return controllerPolicy{}, invalid
	}
	return policy, nil
}

func (c *controller) readinessHTTPServer() *http.Server {
	p := c.policy
	return &http.Server{Handler: c.readinessHandler(), ReadHeaderTimeout: time.Duration(p.ReadyReadHeaderTimeoutSeconds) * time.Second, ReadTimeout: time.Duration(p.ReadyReadTimeoutSeconds) * time.Second, WriteTimeout: time.Duration(p.ReadyWriteTimeoutSeconds) * time.Second, IdleTimeout: time.Duration(p.ReadyIdleTimeoutSeconds) * time.Second, MaxHeaderBytes: int(p.ReadyMaxHeaderBytes)}
}
