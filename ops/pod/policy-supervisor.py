# Explicit new-image entry contract: old images fail instead of starting their
# fixed-port legacy supervisor with a newer selected-policy deployment.
import os
from runtime_policy import load_supervisor_policy
from supervisor import main

if __name__ == '__main__':
    url, policy = load_supervisor_policy(os.environ['OPS_MCP_POLICY_FILE'])
    main(mcp_url=url, policy=policy)
