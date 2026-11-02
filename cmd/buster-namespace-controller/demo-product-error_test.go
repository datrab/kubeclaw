package main

import (
	"errors"
	"testing"
)

func TestProductErrorCodeFraming(t *testing.T) {
	cases := []struct{ input, want string }{
		{"DEMO_PRODUCT_NOT_CURRENT", "DEMO_PRODUCT_NOT_CURRENT"},
		{"DEMO_PRODUCT_DECISION_NOT_FOUND", "DEMO_PRODUCT_DECISION_NOT_FOUND"},
		{"server unavailable", "DEMO_PRODUCT_EVIDENCE_UNAVAILABLE"},
		{"DEMO_PRODUCT_", "DEMO_PRODUCT_EVIDENCE_UNAVAILABLE"},
		{"DEMO_PRODUCT_BAD\n", "DEMO_PRODUCT_EVIDENCE_UNAVAILABLE"},
		{"DEMO_PRODUCT_BAD\r\n---\napiVersion: v1\nkind: Secret", "DEMO_PRODUCT_EVIDENCE_UNAVAILABLE"},
		{"DEMO_PRODUCT_BAD: {apiVersion: v1, kind: Secret}", "DEMO_PRODUCT_EVIDENCE_UNAVAILABLE"},
	}
	for _, tc := range cases {
		if got := productErrorCode(errors.New(tc.input)); got != tc.want {
			t.Errorf("input %q: got %q, want %q", tc.input, got, tc.want)
		}
	}
}
