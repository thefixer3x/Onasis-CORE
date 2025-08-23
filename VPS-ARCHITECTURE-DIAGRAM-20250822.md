# Current VPS Architecture Diagram
**Generated:** August 22, 2025 15:02 UTC  
**Server:** srv896342.hstgr.cloud (168.231.74.29)  
**Analysis By:** Claude Code  

## 🗺️ Current VPS Architecture

```mermaid
graph TB
    subgraph "VPS Server: srv896342.hstgr.cloud (168.231.74.29)"
        subgraph "System Services"
            nginx[🔧 Nginx - SSL Issue<br/>Port 80/443<br/>❌ SSL cert missing]
            pm2[🔄 PM2<br/>Process Manager<br/>✅ Installed, No processes]
        end
        
        subgraph "Project Directories"
            ghost[📁 ghost-protocol/<br/>Frontend + Backend Files]
            fixer[📁 fixer-initiative/<br/>Full Git Repository]
            agent[📁 agent-banks-placeholder/<br/>Express.js placeholder]
            vortex[📁 vortexcore-dashboard/<br/>JWT-based dashboard]
        end
        
        subgraph "ghost-protocol Structure"
            api_gw[📄 api-gateway-server.js<br/>🔌 Port config needed]
            memory_srv[📄 enhanced-memory-server.js<br/>🧠 Memory management]
            mcp_client[📄 smart-memory-mcp-client.js<br/>🤖 MCP client only]
            simple_srv[📄 simple-server.js<br/>🚀 Basic HTTP server]
            tests[📄 test-*.js files<br/>🧪 Various test files]
        end
        
        subgraph "Missing Components"
            mcp_server[❌ No MCP Server<br/>Standards-compliant stdio]
            running_services[❌ No Running Services<br/>PM2 processes: 0]
            ssl_certs[❌ SSL Certificates<br/>Let's Encrypt expired]
        end
        
        subgraph "Available Resources"
            cpu[💻 1 vCPU]
            ram[🧠 4GB RAM]
            disk[💾 50GB SSD]
            ports[🔌 Available Ports<br/>3000-8010 open]
        end
    end

    subgraph "Local Development (Not Deployed)"
        local_mcp[📁 onasis-core/<br/>stdio-mcp-server.js<br/>✨ Standards-compliant]
        local_deploy[📁 deploy/<br/>mcp-server.js<br/>🏢 Enterprise deployment]
        local_services[📁 services/<br/>WebSocket handlers<br/>API gateway enhanced]
    end

    ghost --> api_gw
    ghost --> memory_srv  
    ghost --> mcp_client
    ghost --> simple_srv
    
    nginx -.->|❌ SSL Issue| ghost
    pm2 -.->|No processes| ghost
    
    local_mcp -.->|🚀 Ready to deploy| missing_services[Missing on VPS]
    local_deploy -.->|🔧 Needs deployment| missing_services
    
    style nginx fill:#ffcccb
    style pm2 fill:#ffeb9c  
    style mcp_server fill:#ffcccb
    style running_services fill:#ffcccb
    style ssl_certs fill:#ffcccb
    style local_mcp fill:#90EE90
    style local_deploy fill:#90EE90
```

## 📊 Current Status Summary

### ✅ **Available Infrastructure**
- **VPS Resources**: 1 vCPU, 4GB RAM, 50GB SSD
- **Network**: Ports 3000-8010 open
- **Process Manager**: PM2 installed and ready
- **Web Server**: Nginx installed (needs SSL fix)
- **Development Code**: Complete MCP implementation ready locally

### ❌ **Critical Issues**
1. **No Running MCP Server**: Only client exists, no stdio server
2. **SSL Certificate Expired**: Nginx failing for api.connectionpoint.tech
3. **No Active Services**: PM2 showing 0 processes
4. **Deployment Gap**: Local MCP code not transferred to VPS

### 🏗️ **Existing Project Structure**
```
/root/
├── ghost-protocol/              # Frontend + limited backend
│   ├── api-gateway-server.js    # API gateway (needs config)
│   ├── enhanced-memory-server.js # Memory management
│   ├── smart-memory-mcp-client.js # MCP client only
│   └── test-*.js               # Various test files
├── fixer-initiative/           # Full git repository  
├── agent-banks-placeholder/    # Express.js placeholder
└── vortexcore-dashboard/       # JWT-based dashboard
```

### 🎯 **Immediate Needs**
1. Deploy standalone MCP server from onasis-core
2. Fix SSL certificates and nginx configuration
3. Configure proper domain routing
4. Establish PM2 process management
5. Set up Supabase connection with SSL certificate

---

**Next Steps**: See COMPREHENSIVE-MCP-DEPLOYMENT-PLAN-20250822.md