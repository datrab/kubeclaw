# Ops namespace deduplication correction

Additive correction for OPS-RESUMED-001. All 31 original IDs/bodies retained, 30 rows unchanged. Only SRC-1885e83d3f76b091 corrects downstream deduplication and adds actual loader/RoleBinding source pins. MCP splits without trimming, validates members and default membership, then deduplicates. Helm ranges the original list. Original batch-37 and rejected review remain unchanged. Static source inventory only; independent recheck pending; no global C0 or runtime acceptance.
