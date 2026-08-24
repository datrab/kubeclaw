# Remote test gate adapter

This adapter sends one resolved provider plan to the authenticated Buster plan
runtime. It signs committed source, imports terminal evidence, and returns the
Nova gate decision. It never invokes the legacy suite bridge.
