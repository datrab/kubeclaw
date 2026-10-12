# Private initialized-idle overflow regression

Two profiles512/4096 through actual ProviderProcessSession, genuine launcher/child and owned process cleanup. Scratch trigger is written only after successful initial initialize, ensuring the overflow occurs when no execution or cleanup callback is registered. Measured real stdout bytes and actual child close distinguish protocol overflow from an invented diagnostic. Low checks the retained exact error on all three late APIs; high checks log dispatch and real execute/cleanup. Original Ownership bodies unchanged, only forward byte observation and accessor added to fixture.

No production writes or runtime/syntax checks. Before snapshot, change.patch and manifest bind the draft; Root must independently review it. It requires Root protocol-order V2 to pass.
