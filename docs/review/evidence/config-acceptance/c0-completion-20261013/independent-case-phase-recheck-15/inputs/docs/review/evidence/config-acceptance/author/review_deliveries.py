"""Pinned independent deliveries, not author-provided review flags.

Reuse the historical_mapping.py evidence pinning boundary. Register only after
an actual independent completion delivered an exact scoped receipt and report;
record that delivery and obtain a fresh tooling recheck of registrations. A
matching hash establishes byte identity, NOT independent reviewer provenance.
The native delivery must establish provenance outside the authored artifacts.

No existing intermediate report is a complete definition acceptance receipt.
Consequently the production checker currently has no approved registrations.
Tests may inject isolated fixtures into the verifier but not this registry.
"""

REGISTERED_INDEPENDENT_DELIVERIES = ()
