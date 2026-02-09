"""
RetailFixIt — System Architecture Diagram
Generate with: python architecture_diagram.py
Requires: pip install graphviz  +  brew install graphviz
Output: architecture_diagram.png
"""

from graphviz import Digraph

g = Digraph('RetailFixIt', format='png', engine='dot')
g.attr(
    rankdir='LR',
    bgcolor='#1a1a2e',
    fontname='Helvetica',
    fontsize='16',
    label='RetailFixIt — System Architecture\nMobile-First Retail Repair Platform (React Native + Express + Azure)\n',
    labelloc='t',
    fontcolor='white',
    pad='0.8',
    nodesep='0.35',
    ranksep='1.5',
    dpi='150',
    splines='curved',
    compound='true',
)

g.attr('node', shape='box', style='rounded,filled', fontname='Helvetica', fontsize='10', margin='0.2,0.12')
g.attr('edge', fontname='Helvetica', fontsize='9', fontcolor='#cccccc')

# ============================================
# MOBILE CLIENT
# ============================================
with g.subgraph(name='cluster_mobile') as m:
    m.attr(
        label='  MOBILE CLIENT  (React Native Expo SDK 54)  ',
        style='rounded,filled', color='#2d6a4f', fillcolor='#1b4332',
        fontcolor='#95d5b2', fontsize='13', fontname='Helvetica-Bold',
    )

    # Screens - single node to reduce clutter
    m.node('screens', (
        '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="4">'
        '<TR><TD COLSPAN="3"><B><FONT COLOR="#b7e4c7">Screens</FONT></B></TD></TR>'
        '<TR>'
        '<TD><FONT COLOR="white">Login</FONT></TD>'
        '<TD><FONT COLOR="white">Job List</FONT></TD>'
        '<TD><FONT COLOR="white">Job Detail</FONT></TD>'
        '</TR><TR>'
        '<TD><FONT COLOR="white">Create Job</FONT></TD>'
        '<TD><FONT COLOR="white">Activity</FONT></TD>'
        '<TD><FONT COLOR="white">Profile</FONT></TD>'
        '</TR>'
        '</TABLE>>'
    ), shape='box', fillcolor='#2d6a4f', color='#40916c', fontcolor='white')

    # Services - single node
    m.node('services', (
        '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="4">'
        '<TR><TD COLSPAN="2"><B><FONT COLOR="#b7e4c7">Mobile Services</FONT></B></TD></TR>'
        '<TR>'
        '<TD><FONT COLOR="white">Sync Engine</FONT></TD>'
        '<TD><FONT COLOR="white">SignalR Client</FONT></TD>'
        '</TR><TR>'
        '<TD><FONT COLOR="white">API Client</FONT></TD>'
        '<TD><FONT COLOR="white">Image Picker</FONT></TD>'
        '</TR>'
        '</TABLE>>'
    ), shape='box', fillcolor='#2d6a4f', color='#40916c')

    # Local Storage - single node
    m.node('local_storage', (
        '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="4">'
        '<TR><TD COLSPAN="2"><B><FONT COLOR="#b7e4c7">Local Storage</FONT></B></TD></TR>'
        '<TR>'
        '<TD><FONT COLOR="white">SQLite</FONT></TD>'
        '<TD><FONT COLOR="white">SecureStore</FONT></TD>'
        '</TR><TR>'
        '<TD><FONT COLOR="#95d5b2"><I>jobs, pending_actions, sync_meta</I></FONT></TD>'
        '<TD><FONT COLOR="#95d5b2"><I>JWT tokens</I></FONT></TD>'
        '</TR>'
        '</TABLE>>'
    ), shape='box', fillcolor='#2d6a4f', color='#40916c')

# ============================================
# EXPRESS BACKEND
# ============================================
with g.subgraph(name='cluster_backend') as b:
    b.attr(
        label='  EXPRESS BACKEND  (Node.js 18+, TypeScript, Express 5)  ',
        style='rounded,filled', color='#4a4e69', fillcolor='#22223b',
        fontcolor='#c9ada7', fontsize='13', fontname='Helvetica-Bold',
    )

    # Middleware - single node
    b.node('middleware', (
        '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="4">'
        '<TR><TD COLSPAN="3"><B><FONT COLOR="#9a8c98">Middleware Pipeline</FONT></B></TD></TR>'
        '<TR>'
        '<TD><FONT COLOR="#f2e9e4">Helmet</FONT></TD>'
        '<TD><FONT COLOR="#f2e9e4">CORS</FONT></TD>'
        '<TD><FONT COLOR="#f2e9e4">Gzip</FONT></TD>'
        '</TR><TR>'
        '<TD><FONT COLOR="#f2e9e4">Pino Logger</FONT></TD>'
        '<TD><FONT COLOR="#f2e9e4">JWT Auth</FONT></TD>'
        '<TD><FONT COLOR="#f2e9e4">RBAC</FONT></TD>'
        '</TR>'
        '</TABLE>>'
    ), shape='box', fillcolor='#2b2d42', color='#4a4e69')

    # API Routes - single node with all routes
    b.node('routes', (
        '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="3">'
        '<TR><TD COLSPAN="3"><B><FONT COLOR="#9a8c98">API Routes (13 endpoints)</FONT></B></TD></TR>'
        '<TR>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">GET  /api/health</FONT></TD>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">POST /api/auth/login</FONT></TD>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">GET  /api/auth/technicians</FONT></TD>'
        '</TR><TR>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">GET  /api/jobs</FONT></TD>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">GET  /api/jobs/:id</FONT></TD>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">POST /api/jobs</FONT></TD>'
        '</TR><TR>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">PATCH /api/jobs/:id/status</FONT></TD>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">POST /api/jobs/:id/assign</FONT></TD>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">DELETE /api/jobs/:id</FONT></TD>'
        '</TR><TR>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">POST /api/jobs/sync</FONT></TD>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">POST /api/jobs/:id/attachments</FONT></TD>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">DELETE /api/jobs/:id/attach./:aid</FONT></TD>'
        '</TR><TR>'
        '<TD ALIGN="LEFT"><FONT COLOR="#f2e9e4" POINT-SIZE="8">POST /api/signalr/negotiate</FONT></TD>'
        '<TD></TD><TD></TD>'
        '</TR>'
        '</TABLE>>'
    ), shape='box', fillcolor='#2b2d42', color='#4a4e69')

# ============================================
# AZURE CLOUD SERVICES
# ============================================
with g.subgraph(name='cluster_azure') as a:
    a.attr(
        label='  AZURE CLOUD SERVICES  ',
        style='rounded,filled', color='#005f73', fillcolor='#001219',
        fontcolor='#94d2bd', fontsize='13', fontname='Helvetica-Bold',
    )

    # Cosmos DB
    a.node('cosmos', (
        '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="4">'
        '<TR><TD COLSPAN="2"><B><FONT COLOR="#90e0ef">Azure Cosmos DB</FONT></B></TD></TR>'
        '<TR><TD COLSPAN="2"><FONT COLOR="#caf0f8">Database: RetailFixItDB</FONT></TD></TR>'
        '<TR>'
        '<TD><FONT COLOR="white">Jobs (/tenantId)</FONT></TD>'
        '<TD><FONT COLOR="white">Users (/tenantId)</FONT></TD>'
        '</TR><TR>'
        '<TD COLSPAN="2"><FONT COLOR="#90e0ef"><I>eTag concurrency | Patch ops | Cross-partition queries</I></FONT></TD>'
        '</TR>'
        '</TABLE>>'
    ), shape='box', fillcolor='#023e8a', color='#0077b6')

    # SignalR
    a.node('signalr', (
        '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="4">'
        '<TR><TD><B><FONT COLOR="#e0aaff">Azure SignalR Service</FONT></B></TD></TR>'
        '<TR><TD><FONT COLOR="#d0bfff">Hub: retailfixit (Serverless)</FONT></TD></TR>'
        '<TR><TD><FONT COLOR="white">Groups: vendor-*, user-*, admin</FONT></TD></TR>'
        '<TR><TD><FONT COLOR="#e0aaff"><I>JobCreated | JobAssigned | StatusChanged | JobDeleted</I></FONT></TD></TR>'
        '</TABLE>>'
    ), shape='box', fillcolor='#3c096c', color='#7b2cbf')

    # Blob Storage
    a.node('blob', (
        '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="4">'
        '<TR><TD><B><FONT COLOR="#f4a261">Azure Blob Storage</FONT></B></TD></TR>'
        '<TR><TD><FONT COLOR="#ffd6a5">Account: attachmentsjob</FONT></TD></TR>'
        '<TR><TD><FONT COLOR="white">Container: job-attachments</FONT></TD></TR>'
        '<TR><TD><FONT COLOR="#f4a261"><I>SAS URLs (1-hour read-only expiry)</I></FONT></TD></TR>'
        '</TABLE>>'
    ), shape='box', fillcolor='#6c3428', color='#e76f51')

# ============================================
# CONNECTIONS
# ============================================

# Mobile internal
g.edge('screens', 'services', label='user actions', color='#52b788', fontcolor='#95d5b2', penwidth='1.5')
g.edge('services', 'local_storage', label='offline cache\n+ token storage', color='#52b788', fontcolor='#95d5b2', dir='both', penwidth='1.5')

# Mobile → Backend
g.edge('services', 'middleware', label='  HTTPS REST  \n  (JSON, bearer token, gzip)  ', color='#40916c', penwidth='3', fontcolor='#95d5b2')

# Middleware → Routes
g.edge('middleware', 'routes', label='request pipeline', color='#4a4e69', penwidth='1.5', fontcolor='#9a8c98')

# Mobile ↔ SignalR (WebSocket)
g.edge('services', 'signalr', label='  WSS WebSocket  \n  (real-time push)  ', color='#9d4edd', penwidth='3', fontcolor='#e0aaff', dir='both')

# Backend → Cosmos DB
g.edge('routes', 'cosmos', label='  SDK  \n  (read/write jobs & users)  ', color='#0096c7', penwidth='2.5', fontcolor='#90e0ef')

# Backend → Blob Storage
g.edge('routes', 'blob', label='  SDK  \n  (upload/delete photos)  ', color='#e76f51', penwidth='2.5', fontcolor='#f4a261')

# Backend → SignalR (broadcast)
g.edge('routes', 'signalr', label='  REST API  \n  (broadcast events)  ', color='#9d4edd', penwidth='2', fontcolor='#e0aaff', style='dashed')

# Mobile → Blob (direct SAS)
g.edge('services', 'blob', label='  direct photo download  \n  (SAS URL)  ', color='#e76f51', penwidth='2', fontcolor='#f4a261', style='dashed')

# ============================================
# LAYOUT HINTS
# ============================================
# Invisible edges to improve vertical alignment of Azure services
g.edge('cosmos', 'signalr', style='invis')
g.edge('signalr', 'blob', style='invis')

# ============================================
# RENDER
# ============================================
g.render('architecture_diagram', cleanup=True)
print("Diagram saved as architecture_diagram.png")
