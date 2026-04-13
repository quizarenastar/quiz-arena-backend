# Quiz Arena Architecture Flow Diagrams

Below are the 6 core flow diagrams illustrating the business logic and user journeys within Quiz Arena. You can paste these directly into markdown viewers that support Mermaid.js, or use [Mermaid Live Editor](https://mermaid.live/) to generate images from them.

---

### 1. Quiz Creation & Approval Flow
*Illustrates how a user creates a quiz, the AI moderation process, and the fallback to manual admin approval.*

```mermaid
graph TD
    classDef user fill:transparent,stroke:#3B82F6,stroke-width:2px,color:#3B82F6;
    classDef ai fill:transparent,stroke:#8B5CF6,stroke-width:2px,color:#8B5CF6;
    classDef admin fill:transparent,stroke:#F59E0B,stroke-width:2px,color:#F59E0B;
    classDef system fill:transparent,stroke:#10B981,stroke-width:2px,color:#10B981;

    A[User Creates Quiz]:::user --> B[Fills Details & Adds Questions]:::user
    B --> C[Submit for Review]:::user
    C --> D{AI Moderation Service}:::ai
    
    D -- Score >= 60 & Safe --> E[Auto-Approved]:::system
    D -- Score < 60 or Unsafe --> F[Flagged as Pending]:::system
    D -- AI Error / Timeout --> F
    
    F --> G[Admin Dashboard Review]:::admin
    G --> H{Admin Decision}:::admin
    
    H -- Approve --> E
    H -- Reject --> I[Quiz Rejected]:::system
    
    E --> J[Status: Published - Available for Players]:::system
    I --> K[Notify Creator of Rejection]:::system
```

---

### 2. Standard Quiz Attempt Flow (with Economic Checks)
*Shows the end-to-end journey of a user attempting a quiz, including wallet checks and WebSocket interactions.*

```mermaid
graph TD
    classDef user fill:transparent,stroke:#3B82F6,stroke-width:2px,color:#3B82F6;
    classDef socket fill:transparent,stroke:#06B6D4,stroke-width:2px,color:#06B6D4;
    classDef db fill:transparent,stroke:#10B981,stroke-width:2px,color:#10B981;
    classDef ai fill:transparent,stroke:#8B5CF6,stroke-width:2px,color:#8B5CF6;

    A[User Selects Quiz]:::user --> B{Is Paid Quiz?}:::db
    
    B -- Yes --> C{Check Wallet Balance}:::db
    C -- Insufficient --> D[Redirect to Wallet Recharge]:::user
    C -- Sufficient --> E[Deduct Entry Fee]:::db
    
    B -- No --> F[Connect via WebSocket]:::socket
    E --> F
    
    F --> G[Initialize Attempt & Load Questions]:::db
    G --> H[Display Question with Timer]:::user
    
    H --> I[User Submits Answer]:::user
    I --> J{Anti-Cheat Violation?}:::socket
    
    J -- Yes --> K[Record Violation]:::socket
    K --> L{Exceeds Violations Limit?}:::socket
    
    J -- No --> M{More Questions?}:::socket
    L -- No --> M
    L -- Yes --> N[Force Auto-Submit]:::socket
    
    M -- Yes --> H
    M -- No --> N
    
    N --> O[Calculate Final Score]:::db
    O --> P[Generate AI Performance Analysis]:::ai
    P --> Q[Display Results & Insights]:::user
```

---

### 3. War Room Multiplayer Flow
*Details the real-time, real-time multiplayer lifecycle powered by WebSockets and OpenAI generation.*

```mermaid
graph TD
    classDef host fill:transparent,stroke:#3B82F6,stroke-width:2px,color:#3B82F6;
    classDef players fill:transparent,stroke:#14B8A6,stroke-width:2px,color:#14B8A6;
    classDef socket fill:transparent,stroke:#06B6D4,stroke-width:2px,color:#06B6D4;
    classDef ai fill:transparent,stroke:#8B5CF6,stroke-width:2px,color:#8B5CF6;

    A[Host Creates War Room]:::host --> B[Room Generated with 6-char Code]:::socket
    B --> C[Players Join via Code / Link]:::players
    
    C --> D{Host Clicks Start?}:::host
    D -- No --> C
    D -- Yes --> E[Broadcast 5-Second Countdown]:::socket
    
    E --> F[AI Generates Quiz Questions Based on Room Settings]:::ai
    F --> G[Format & Broadcast Questions to All]:::socket
    
    G --> H[Players Answer Concurrently]:::players
    H --> I[Live Leaderboard Updates per Answer]:::socket
    
    I --> J{All Finished or Timer Expires?}:::socket
    J -- No --> H
    J -- Yes --> K[Lock Submissions & Calculate Rankings]:::socket
    
    K --> L[Broadcast Winner & Final Scores]:::socket
    L --> M{Host Starts Next Round?}:::host
    M -- Yes --> D
    M -- No --> N[Close War Room]:::socket
```

---

### 4. Paid Quiz Economy & Cron Lifecycle
*Maps the timeline-based logic of paid quizzes, minimum participant rules, and the 20/30/50 profit distribution.*

```mermaid
graph TD
    classDef db fill:transparent,stroke:#10B981,stroke-width:2px,color:#10B981;
    classDef cron fill:transparent,stroke:#F59E0B,stroke-width:2px,color:#F59E0B;
    classDef money fill:transparent,stroke:#EC4899,stroke-width:2px,color:#EC4899;

    A[Paid Quiz Published]:::db --> B[Registration Opens]:::db
    B --> C[Users Pay Entry Fee]:::money
    C --> D[Prize Pool Accumulates]:::db
    
    D --> E{CRON: Quiz Start Time Reached}:::cron
    E --> F{Registered Users >= 5?}:::cron
    
    F -- No --> G[Status: Cancelled]:::db
    G --> H[Process Full Refunds to All Wallets]:::money
    
    F -- Yes --> I[Quiz Commences]:::db
    I --> J[Players Attempt Quiz]:::db
    
    J --> K{CRON: Quiz End Time Reached}:::cron
    K --> L[Rank All Completed Attempts by Score/Time]:::db
    
    L --> M[Calculate Split 20/30/50]:::money
    M --> N[50% Distributed to Top Winners]:::money
    M --> O[30% Credited to Quiz Creator]:::money
    M --> P[20% Retained by Platform Commission]:::money
    
    N --> Q[Prize Distribution Complete]:::db
```

---

### 5. Anti-Cheat Monitoring Flow
*Shows the strict client-to-server security mechanisms during an active quiz session.*

```mermaid
graph TD
    classDef client fill:transparent,stroke:#3B82F6,stroke-width:2px,color:#3B82F6;
    classDef server fill:transparent,stroke:#06B6D4,stroke-width:2px,color:#06B6D4;
    classDef alert fill:transparent,stroke:#EF4444,stroke-width:2px,color:#EF4444;

    A[Quiz Start]:::client --> B[Initialize Event Listeners]:::client
    B --> C{Detect Suspicious Action?}:::client
    
    C -- Loss of window focus --> D[Record Focus Loss Event]:::client
    C -- Tab Switch/Minimize --> E[Record Tab Switch Event]:::client
    C -- Copy/Paste Attempt --> F[Record Clipboard Event]:::client
    C -- Right Click/DevTools --> G[Record DOM Event]:::client
    
    D & E & F & G --> H[Emit quiz:violation Event]:::server
    
    H --> I[Append Violation to Attempt Log]:::server
    I --> J{Check Strike Rules}:::server
    
    J -- Severity: Critical --> K[Trigger Auto-Submit]:::alert
    J -- Tab Switches >= Max --> K
    J -- Total Violations >= 10 --> K
    
    J -- Below Threshold --> L[Return Warning to Client]:::server
    L --> C
    
    K --> M[Force End Quiz]:::alert
    M --> N[Flag Attempt in Dashboard for Review]:::server
```

---

### 6. Wallet Recharge & Withdrawal Flow
*Shows how monetary transactions move through the system and admin verification.*

```mermaid
graph TD
    classDef user fill:transparent,stroke:#3B82F6,stroke-width:2px,color:#3B82F6;
    classDef admin fill:transparent,stroke:#F59E0B,stroke-width:2px,color:#F59E0B;
    classDef system fill:transparent,stroke:#10B981,stroke-width:2px,color:#10B981;

    A[User Request]:::user --> B{Transaction Type}:::user
    
    %% Add Funds Flow
    B -- Add Funds --> C[External Payment Gateway]:::user
    C -- Success --> D[Submit Proof/UTR]:::user
    D --> E[Status: Pending Addition]:::system
    E --> F[Admin Validates Payment]:::admin
    F --> G{Verification}:::admin
    G -- Approved --> H[Credit User Wallet]:::system
    G -- Rejected --> I[Mark as Failed]:::system
    
    %% Withdrawal Flow
    B -- Withdraw --> J{Check Available Balance > 0}:::system
    J -- No --> K[Deny Request]:::system
    J -- Yes --> L[Deduct Balance Temporary]:::system
    L --> M[Status: Pending Withdrawal]:::system
    M --> N[Admin Processes Bank Transfer]:::admin
    N --> O{Bank Status}:::admin
    O -- Successful --> P[Mark Transaction Complete]:::system
    O -- Failed/Rejected --> Q[Refund Amount to User Wallet]:::system
```
