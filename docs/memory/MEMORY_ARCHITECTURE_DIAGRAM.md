# Memory Service Architecture Diagrams

## Overall Integration Architecture

```mermaid
graph TB
    subgraph "Onasis-CORE Monorepo"
        GW[Onasis Gateway<br/>:3001]
        
        subgraph "Git Submodule"
            MS[Memory Service<br/>:3000]
            CLI[Memory CLI]
            SDK[Memory SDK]
            VSC[VSCode Ext]
            CUR[Cursor Ext]
            WIN[Windsurf Ext]
        end
        
        subgraph "Symlinks"
            PSDK[packages/external/memory-sdk]
            TCLI[tools/memory-cli]
            TEXT[tools/*-extensions]
        end
    end
    
    subgraph "External Services"
        NPM[npm Registry]
        PROD[api.lanonasis.com]
        DB[(Supabase<br/>PostgreSQL)]
        AI[OpenAI API]
    end
    
    subgraph "Clients"
        WEB[Web Apps]
        IDE[IDEs]
        AIASST[AI Assistants]
        CLIUSER[CLI Users]
    end
    
    %% Connections
    GW --> MS
    GW --> PROD
    MS --> DB
    MS --> AI
    
    SDK -.-> PSDK
    CLI -.-> TCLI
    VSC -.-> TEXT
    CUR -.-> TEXT
    WIN -.-> TEXT
    
    SDK --> NPM
    CLI --> NPM
    
    WEB --> GW
    IDE --> MS
    AIASST --> MS
    CLIUSER --> CLI
    
    classDef submodule fill:#e1f5fe,stroke:#01579b
    classDef symlink fill:#fff3e0,stroke:#e65100
    classDef external fill:#f3e5f5,stroke:#4a148c
    classDef client fill:#e8f5e9,stroke:#1b5e20
    
    class MS,CLI,SDK,VSC,CUR,WIN submodule
    class PSDK,TCLI,TEXT symlink
    class NPM,PROD,DB,AI external
    class WEB,IDE,AIASST,CLIUSER client
```

## MCP Communication Flow

```mermaid
sequenceDiagram
    participant AI as AI Assistant
    participant MCP as MCP Server
    participant MS as Memory Service
    participant DB as Database
    
    AI->>MCP: Connect (WebSocket)
    MCP->>AI: Connection established
    
    AI->>MCP: List tools
    MCP->>AI: Available tools list
    
    AI->>MCP: Call tool: memory_search
    MCP->>MS: Search request
    MS->>DB: Vector search query
    DB->>MS: Search results
    MS->>MCP: Formatted results
    MCP->>AI: Tool response
    
    Note over AI,DB: All communication is async
```

## Development Workflow

```mermaid
graph LR
    subgraph "Developer Machine"
        DEV[Developer]
        LOCAL[Local Onasis-CORE]
        SUB[Memory Submodule]
    end
    
    subgraph "Version Control"
        CORE[Onasis-CORE Repo]
        MEMORY[vibe-memory Repo]
    end
    
    subgraph "Deployment"
        CI[CI/CD Pipeline]
        DOCKER[Docker Registry]
        NPM[npm Registry]
        PROD[Production]
    end
    
    DEV -->|1. Clone| CORE
    CORE -->|2. Submodule init| MEMORY
    MEMORY -->|3. Checkout| SUB
    SUB -->|4. Develop| LOCAL
    
    LOCAL -->|5. Test| LOCAL
    LOCAL -->|6. Commit submodule| CORE
    
    CORE -->|7. Push| CI
    CI -->|8. Build| DOCKER
    CI -->|9. Publish| NPM
    CI -->|10. Deploy| PROD
    
    style DEV fill:#4caf50
    style PROD fill:#ff5722
```

## Service Dependencies

```mermaid
graph TD
    subgraph "Build Order"
        A[Shared Types]
        B[Memory SDK]
        C[Memory Service]
        D[Memory CLI]
        E[IDE Extensions]
    end
    
    A --> B
    B --> C
    B --> D
    B --> E
    C --> D
    
    subgraph "Runtime Dependencies"
        MS[Memory Service]
        DB[(PostgreSQL)]
        REDIS[(Redis)]
        AI[OpenAI]
        AUTH[Supabase Auth]
    end
    
    MS --> DB
    MS -.->|Optional| REDIS
    MS --> AI
    MS --> AUTH
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Production Environment"
        LB[Load Balancer]
        
        subgraph "API Servers"
            API1[Memory API 1]
            API2[Memory API 2]
            API3[Memory API N]
        end
        
        subgraph "MCP Servers"
            MCP1[MCP Server 1]
            MCP2[MCP Server 2]
        end
        
        subgraph "Data Layer"
            PG[(PostgreSQL<br/>Primary)]
            PGR[(PostgreSQL<br/>Replica)]
            REDIS[(Redis Cache)]
        end
    end
    
    subgraph "External"
        CDN[CDN]
        S3[Object Storage]
        MONITORING[Monitoring]
    end
    
    LB --> API1
    LB --> API2
    LB --> API3
    
    LB --> MCP1
    LB --> MCP2
    
    API1 --> PG
    API2 --> PG
    API3 --> PG
    
    API1 --> REDIS
    API2 --> REDIS
    API3 --> REDIS
    
    PG --> PGR
    
    API1 --> S3
    API1 --> MONITORING
```

## Extension Architecture

```mermaid
graph TD
    subgraph "VSCode Extension"
        UI[Extension UI]
        CMD[Commands]
        TREE[Tree View]
        
        subgraph "Client Layer"
            HYBRID[Hybrid Client]
            MCP[MCP Client]
            REST[REST Client]
        end
    end
    
    subgraph "Connection Modes"
        LOCAL[Local MCP<br/>ws://localhost:3002]
        REMOTE[Remote API<br/>api.lanonasis.com]
    end
    
    UI --> CMD
    CMD --> HYBRID
    TREE --> HYBRID
    
    HYBRID --> MCP
    HYBRID --> REST
    
    MCP --> LOCAL
    REST --> REMOTE
    
    HYBRID -.->|Fallback| REST
    
    style HYBRID fill:#fff59d
    style MCP fill:#81c784
    style REST fill:#64b5f6
```