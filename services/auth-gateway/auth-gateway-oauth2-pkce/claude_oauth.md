Transport and Auth
Claude supports both SSE- and Streamable HTTP-based remote servers, although support for SSE may be deprecated in the coming months.

Claude supports both authless and OAuth-based remote servers.

Auth Support

Claude supports the 3/26 auth spec and (as of July) the 6/18 auth spec.

Claude supports Dynamic Client Registration (DCR).

OAuth servers can signal to Claude that a DCR client has been deleted and that Claude should re-register the client by returning an HTTP 401 with an error of invalid_client from the token endpoint, as described in RFC 6749.

As of July, users are also able to specify a custom client ID and client secret when configuring a server that doesn’t support DCR.

Claude’s OAuth callback URL is https://claude.ai/api/mcp/auth_callback and its OAuth client name is Claude.

This callback URL may change to https://claude.com/api/mcp/auth_callback in the future – if you choose to allowlist MCP client callback URLs, please allowlist this callback URL as well to ensure that your server continues to work with Claude.