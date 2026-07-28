# Secret resolver

Resolves explicitly mapped logical secret names from operator-provided
environment variables. Unknown, absent, and empty values fail closed.

`secrets.read` is a confidential capability: core invokes it transiently and
never writes its request or result to effect journals, receipts, lifecycle
events, or replay state.
