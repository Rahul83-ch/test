# Phase 2 Backend

Includes Ceph and OSD endpoints using rook-ceph-tools pod placeholder integration.

## APIs
GET /api/ceph/health
GET /api/osds
POST /api/osd/0/in
POST /api/osd/0/out
POST /api/disk/wipe
POST /api/operator/restart

## Note
Toolbox exec helper is scaffolded. Replace with Kubernetes Exec stream for live command output.
