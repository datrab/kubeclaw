package main

import (
	"errors"
	"regexp"
)

var fullStackImage = regexp.MustCompile(`^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$`)

func validateFullStackImages(spec map[string]interface{}) error {
	value, enabled := spec["fullStack"]
	raw, supplied := spec["verifiedImages"]
	if !enabled && !supplied {
		return nil
	}
	if value != true {
		return errors.New("verifiedImages requires explicit fullStack mode")
	}
	images := interfaceSlice(raw)
	if len(images) < 1 || len(images) > 32 {
		return errors.New("verifiedImages must contain 1 to 32 images")
	}
	seen := map[string]bool{}
	for _, value := range images {
		image, ok := value.(string)
		if !ok || len(image) > 2048 || !fullStackImage.MatchString(image) || seen[image] {
			return errors.New("verifiedImages must be unique immutable image references")
		}
		seen[image] = true
	}
	if !seen[stringValue(spec["verifiedImage"])] {
		return errors.New("verifiedImages must include verifiedImage")
	}
	if !regexp.MustCompile(`^sha256:[a-f0-9]{64}$`).MatchString(stringValue(spec["manifestDigest"])) {
		return errors.New("fullStack requires manifestDigest")
	}
	return nil
}
