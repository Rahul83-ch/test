const express = require("express");
const bodyParser = require("body-parser");
const k8s = require("@kubernetes/client-node");
const stream = require("stream");
const cors = require("cors");
const { execSync } = require("child_process");

const app = express();
app.use(bodyParser.json());
app.use(cors({
  origin: "*",   // allow all (for testing)
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const core = kc.makeApiClient(k8s.CoreV1Api);
const batch = kc.makeApiClient(k8s.BatchV1Api);
const apps = kc.makeApiClient(k8s.AppsV1Api);

const exec = new k8s.Exec(kc);

const ns = "rook-ceph";
const toolboxName = "rook-ceph-tools";
const toolboxContainer = "rook-ceph-tools";

/* ---------------------------
   Request Logger Middleware
----------------------------*/
app.use((req, res, next) => {
  const start = Date.now();

  console.log("=================================================");
  console.log("API CALL:", req.method, req.originalUrl);
  console.log("TIME:", new Date().toISOString());

  if (Object.keys(req.body || {}).length > 0) {
    console.log("BODY:", JSON.stringify(req.body));
  }

  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log("RESPONSE STATUS:", res.statusCode);
    console.log("DURATION:", ms + "ms");
    console.log("=================================================");
  });

  next();
});

/* ---------------------------
   Get Toolbox Pod
----------------------------*/
async function getToolboxPod() {
  console.log("Searching toolbox pod...");

  const pods = await core.listNamespacedPod({
    namespace: ns
  });

  const pod = pods.items.find(p =>
    p.metadata.name.includes(toolboxName)
  );

  if (!pod) {
    throw new Error("rook-ceph-tools pod not found");
  }

  console.log("Toolbox pod found:", pod.metadata.name);

  return pod.metadata.name;
}

/* ---------------------------
   Execute Command in Toolbox
----------------------------*/
async function execInToolbox(command) {
  try {
    const podName = await getToolboxPod();

    // ✅ FIX: normalize input
    const commandArray = Array.isArray(command)
      ? command
      : command.split(" ");

    console.log("Executing in pod:", podName);
    console.log("Container:", toolboxContainer);
    console.log("Command:", commandArray.join(" "));

    let stdout = "";
    let stderr = "";

    const stdoutStream = new stream.Writable({
      write(chunk, encoding, callback) {
        stdout += chunk.toString();
        callback();
      }
    });

    const stderrStream = new stream.Writable({
      write(chunk, encoding, callback) {
        stderr += chunk.toString();
        callback();
      }
    });

    await exec.exec(
      ns,
      podName,
      toolboxContainer,
      commandArray,
      stdoutStream,
      stderrStream,
      null,
      false
    );

    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      pod: podName,
      command: commandArray.join(" "),
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };

  } catch (err) {
    throw err;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
/* ---------------------------
   APIs
----------------------------*/

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "API running"
  });
});

app.get("/api/ceph/health", async (req, res) => {
  try {
    const result = await execInToolbox(["ceph", "status"]);

    const output = result.stdout;

    const healthMatch = output.match(/health:\s+([A-Z_]+)/);
    const monMatch = output.match(/mon:\s+(\d+)\s+daemons/);
    const mgrMatch = output.match(/mgr:\s+([^\n]+)/);
    const mdsMatch = output.match(/mds:\s+([^\n]+)/);
    const osdMatch = output.match(/osd:\s+(\d+)\s+osds:\s+(\d+)\s+up.*?(\d+)\s+in/);
    const poolMatch = output.match(/pools:\s+(\d+)\s+pools,\s+(\d+)\s+pgs/);
    const objectMatch = output.match(/objects:\s+([^\n]+)/);
    const usageMatch = output.match(/usage:\s+([^\n]+)/);
    const clientMatch = output.match(/client:\s+([^\n]+)/);

    const degradedLine = output
      .split("\n")
      .find(x => x.includes("degraded"));

    const misplacedLine = output
      .split("\n")
      .find(x => x.includes("misplaced"));

    res.json({
      status: "success",

      cluster: {
        health: healthMatch ? healthMatch[1] : "UNKNOWN",
        id: output.match(/id:\s+([a-z0-9-]+)/)?.[1] || ""
      },

      services: {
        monitors: monMatch ? parseInt(monMatch[1]) : 0,
        manager: mgrMatch ? mgrMatch[1].trim() : "",
        metadata_server: mdsMatch ? mdsMatch[1].trim() : "",
        osds: {
          total: osdMatch ? parseInt(osdMatch[1]) : 0,
          up: osdMatch ? parseInt(osdMatch[2]) : 0,
          in: osdMatch ? parseInt(osdMatch[3]) : 0
        }
      },

      storage: {
        pools: poolMatch ? parseInt(poolMatch[1]) : 0,
        placement_groups: poolMatch ? parseInt(poolMatch[2]) : 0,
        objects: objectMatch ? objectMatch[1].trim() : "",
        usage: usageMatch ? usageMatch[1].trim() : ""
      },

      recovery: {
        degraded: degradedLine ? degradedLine.trim() : "None",
        misplaced: misplacedLine ? misplacedLine.trim() : "None"
      },

      io: clientMatch ? clientMatch[1].trim() : ""
    });

  } catch (err) {
    res.status(500).json({
      status: "failed",
      error: err.message
    });
  }
});

app.get("/api/osds", async (req, res) => {
  try {
    const result = await execInToolbox(["ceph", "osd", "tree"]);

    const lines = result.stdout.split("\n").filter(x => x.trim() !== "");

    const hosts = {};
    let currentHost = "";

    for (const line of lines) {
      const trimmed = line.trim();

      // detect host line
      if (trimmed.includes("host ")) {
        currentHost = trimmed.split("host ")[1].trim();

        hosts[currentHost] = {
          total_osds: 0,
          osds: []
        };
      }

      // detect osd line
      if (trimmed.includes("osd.") && currentHost) {
        const parts = trimmed.split(/\s+/);

        const osdData = {
          osd_id: parseInt(parts[0]),
          class: parts[1],
          weight: parts[2],
          name: parts[3],

          status: parts[4],   // up / down

          in_out:
            (parts[5] === "0" || parts[5] === "0.00000")
              ? "out"
              : "in",

          reweight: parts[5],
          pri_aff: parts[6]
        };
        hosts[currentHost].osds.push(osdData);
        hosts[currentHost].total_osds += 1;
      }
    }

    const totalHosts = Object.keys(hosts).length;

    let totalOsds = 0;
    Object.values(hosts).forEach(h => {
      totalOsds += h.total_osds;
    });

    res.json({
      status: "success",
      summary: {
        total_hosts: totalHosts,
        total_osds: totalOsds
      },
      hosts
    });

  } catch (err) {
    res.status(500).json({
      status: "failed",
      error: err.message
    });
  }
});

app.post("/api/osd/:id/out", async (req, res) => {
  try {
    const result = await execInToolbox([
      "ceph",
      "osd",
      "out",
      req.params.id
    ]);

    res.json(result);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

app.post("/api/osd/:id/in", async (req, res) => {
  try {
    const result = await execInToolbox([
      "ceph",
      "osd",
      "in",
      req.params.id
    ]);

    res.json(result);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

app.post("/api/operator/restart", async (req, res) => {
  try {
    console.log("Restarting rook-ceph-operator...");

    // Read existing deployment
    const existing = await apps.readNamespacedDeployment({
      name: "rook-ceph-operator",
      namespace: ns
    });

    const deployment = existing;

    if (!deployment.spec.template.metadata) {
      deployment.spec.template.metadata = {};
    }

    if (!deployment.spec.template.metadata.annotations) {
      deployment.spec.template.metadata.annotations = {};
    }

    deployment.spec.template.metadata.annotations.restartedAt =
      new Date().toISOString();

    await apps.replaceNamespacedDeployment({
      name: "rook-ceph-operator",
      namespace: ns,
      body: deployment
    });

    res.json({
      status: "success",
      message: "rook-ceph-operator restart triggered"
    });

  } catch (err) {
    console.log("RESTART ERROR:", err);
    res.status(500).json({
      error: err.message
    });
  }
});

app.post("/api/node/ceph-volume/raw-list", async (req, res) => {
  try {
    const { node } = req.body;

    if (!node) {
      return res.status(400).json({
        error: "node is required"
      });
    }

    const jobName = "raw-list-" + Date.now();

    const job = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: jobName,
        namespace: ns
      },
      spec: {
        backoffLimit: 0,
        template: {
          metadata: {
            labels: {
              jobname: jobName
            }
          },
          spec: {
            nodeName: node,
            restartPolicy: "Never",
            hostPID: true,
            containers: [
              {
                name: "runner",
                image: "quay.io/ceph/ceph:v18",
                securityContext: {
                  privileged: true
                },
                command: [
                  "/bin/bash",
                  "-c",
                  "ceph-volume raw list || true"
                ],
                volumeMounts: [
                  { name: "hostdev", mountPath: "/dev" },
                  { name: "udev", mountPath: "/run/udev" },
                  { name: "lvm", mountPath: "/run/lvm" }
                ]
              }
            ],
            volumes: [
              { name: "hostdev", hostPath: { path: "/dev" } },
              { name: "udev", hostPath: { path: "/run/udev" } },
              { name: "lvm", hostPath: { path: "/run/lvm" } }
            ]
          }
        }
      }
    };

    await batch.createNamespacedJob({
      namespace: ns,
      body: job
    });

    await new Promise(r => setTimeout(r, 5000));

    const pods = await core.listNamespacedPod({
      namespace: ns
    });

    const pod = pods.items.find(p =>
      p.metadata.name.includes(jobName)
    );

    if (!pod) {
      return res.status(500).json({
        error: "Job pod not found"
      });
    }

    const podName = pod.metadata.name;

    await new Promise(r => setTimeout(r, 5000));

    const logRes = await core.readNamespacedPodLog({
      name: podName,
      namespace: ns
    });

    let parsed = {};
    let osds = [];

    try {
      parsed = JSON.parse(logRes);

      osds = Object.values(parsed).map(item => ({
        osd_id: item.osd_id,
        device: item.device,
        type: item.type,
        osd_uuid: item.osd_uuid,
        ceph_fsid: item.ceph_fsid
      }));

    } catch (e) {
      osds = [];
    }

    res.json({
      status: "success",
      node,
      job: jobName,
      pod: podName,
      total_osds: osds.length,
      osds,
      raw_output: logRes
    });

  } catch (err) {
    console.log("RAW LIST ERROR:", err);

    res.status(500).json({
      status: "failed",
      error: err.message
    });
  }
});

app.post("/api/node/free-disks", async (req, res) => {
  try {
    const { node } = req.body;

    console.log("==== API /free-disks START ====");
    console.log("REQUEST NODE:", node);

    if (!node) {
      return res.status(400).json({
        status: "failed",
        error: "node is required"
      });
    }

    const jobName = "disk-scan-" + Date.now();
    console.log("JOB NAME:", jobName);

    const job = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: { name: jobName, namespace: ns },
      spec: {
        backoffLimit: 0,
        template: {
          spec: {
            nodeName: node,
            restartPolicy: "Never",
            hostPID: true,
            containers: [{
              name: "runner",
              image: "quay.io/ceph/ceph:v18",
              securityContext: { privileged: true },

              // ✅ ADD THIS (REAL NODE IP)
              env: [
                {
                  name: "HOST_IP",
                  valueFrom: {
                    fieldRef: {
                      fieldPath: "status.hostIP"
                    }
                  }
                }
              ],

              command: [
                "/bin/bash",
                "-c",
                `
echo "===HOST_IP===";
echo $HOST_IP;

echo "===LSBLK===";
lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,SERIAL;

echo "===CEPH===";
ceph-volume raw list || true;
                `
              ],
              volumeMounts: [
                { name: "hostdev", mountPath: "/dev" },
                { name: "udev", mountPath: "/run/udev" },
                { name: "lvm", mountPath: "/run/lvm" }
              ]
            }],
            volumes: [
              { name: "hostdev", hostPath: { path: "/dev" } },
              { name: "udev", hostPath: { path: "/run/udev" } },
              { name: "lvm", hostPath: { path: "/run/lvm" } }
            ]
          }
        }
      }
    };

    await batch.createNamespacedJob({ namespace: ns, body: job });
    console.log("JOB CREATED");

    // ---------------- WAIT POD ----------------
    const waitPod = async () => {
      for (let i = 0; i < 25; i++) {
        const pods = await core.listNamespacedPod({ namespace: ns });

        const pod = pods.items.find(p =>
          p.metadata.name.includes(jobName)
        );

        if (pod) {
          console.log("FOUND POD:", pod.metadata.name, "STATUS:", pod.status.phase);
        }

        if (pod && (pod.status.phase === "Succeeded" || pod.status.phase === "Failed")) {
          return pod;
        }

        await new Promise(r => setTimeout(r, 1000));
      }

      throw new Error("Pod timeout");
    };

    const pod = await waitPod();

    console.log("FINAL POD:", pod.metadata.name);

    const logs = await core.readNamespacedPodLog({
      name: pod.metadata.name,
      namespace: ns
    });

    console.log("==== RAW POD LOGS START ====");
    console.log(logs);
    console.log("==== RAW POD LOGS END ====");

    // ---------------- PARSE ----------------
    const hostIpRaw = logs
      .split("===HOST_IP===")[1]
      ?.split("===LSBLK===")[0]
      ?.trim();

    const hostIP = hostIpRaw || "NA";

    console.log("PARSED HOST IP RAW:", hostIpRaw);
    console.log("FINAL HOST IP:", hostIP);

    const lsblkRaw = logs.split("===LSBLK===")[1].split("===CEPH===")[0].trim();
    const cephRaw = logs.split("===CEPH===")[1].trim();

    console.log("LSBLK RAW LENGTH:", lsblkRaw.length);
    console.log("CEPH RAW LENGTH:", cephRaw.length);

    const lsblk = JSON.parse(lsblkRaw);

    // ---------------- CEPH MAP ----------------
    const cephMap = {};
    try {
      const cephJson = JSON.parse(cephRaw);

      Object.values(cephJson).forEach(e => {
        if (e.device) {
          cephMap[e.device] = e.osd_id;
        }
      });

      console.log("CEPH MAP:", cephMap);
    } catch (e) {
      console.log("CEPH PARSE FAILED:", e.message);
    }

    // ---------------- OSD TREE ----------------
    const osdTree = await execInToolbox(["ceph", "osd", "tree"]);

    const osdInfo = {};
    osdTree.stdout.split("\n").forEach(line => {
      if (line.includes("osd.")) {
        const parts = line.trim().split(/\s+/);
        const id = parseInt(parts[0]);

        osdInfo[id] = {
          status: parts[4] || "NA",
          in_out:
            (parts[5] === "0" || parts[5] === "0.00000")
              ? "out"
              : "in",
        };
      }
    });

    console.log("OSD INFO:", osdInfo);

    // ---------------- HELPERS ----------------
    const isLoopDevice = (name) =>
      name.startsWith("loop") ||
      name.startsWith("nbd") ||
      name.startsWith("rbd");

    const getMounts = (nodes = []) => {
      let m = [];
      for (const n of nodes) {
        if (n.mountpoint) m.push(n.mountpoint);
        if (n.children) m = m.concat(getMounts(n.children));
      }
      return m;
    };

    const isOSDisk = (mounts, children) => {
      const clean = mounts.filter(m =>
        !["/etc/resolv.conf", "/etc/hostname", "/etc/hosts"].includes(m)
      );

      const hasBoot = clean.some(m =>
        m === "/" || m.startsWith("/boot")
      );

      const hasLVM =
        JSON.stringify(children).includes("ubuntu--vg") ||
        JSON.stringify(children).includes("mapper");

      return hasBoot || hasLVM;
    };

    const getSerial = (disk) => disk.serial || "NA";

    // ---------------- MAIN LOGIC ----------------
    const result = [];

    for (const disk of lsblk.blockdevices) {

      if (isLoopDevice(disk.name)) continue;
      if (disk.type !== "disk") continue;
      if (disk.size === "0B") continue;

      const path = "/dev/" + disk.name;
      const children = disk.children || [];
      const mounts = getMounts(children);

      const osdId = cephMap[path];
      const isCeph = osdId !== undefined;
      const isActive = isCeph && osdInfo[osdId]?.status === "up";

      const osDisk = isOSDisk(mounts, children);
      const hasPartitions = children.length > 0;
      const hasFS = disk.fstype || children.some(c => c.fstype);

      let status = "READY";
      let reason = "Clean disk";

      if (osDisk) {
        status = "OS";
        reason = "Used by OS";
      }
      else if (isCeph && isActive) {
        status = "CEPH";
        reason = `Active OSD (${osdId})`;
      }
      else if (isCeph && !isActive) {
        status = "STALE";
        reason = `Old Ceph data (OSD ${osdId})`;
      }
      else if (hasPartitions && hasFS) {
        status = "DIRTY";
        reason = "Disk has both partitions and data (needs cleaning)";
      }
      else if (hasPartitions) {
        status = "DIRTY";
        reason = "Disk contains partitions (needs cleaning)";
      }
      else if (hasFS) {
        status = "DIRTY";
        reason = "Disk has data (needs cleaning)";
      }

      console.log("DISK DEBUG:", {
        disk: disk.name,
        mounts,
        osDisk,
        osdId,
        isActive,
        status
      });

      result.push({
        name: disk.name,
        path,
        size: disk.size,
        status,
        reason,
        serial: getSerial(disk),
        host_ip: hostIP,
        osd_id: osdId ?? "NA",
        osd_status: osdInfo[osdId]?.status || "NA",
        osd_state: osdInfo[osdId]?.in_out || "NA",
      });
      console.log(result,"-------------------");
    }

    console.log("FINAL RESULT:", result);

    return res.json({
      status: "success",
      node,
      disks: result,
      summary: {
        ready: result.filter(d => d.status === "READY").length,
        dirty: result.filter(d => d.status === "DIRTY").length,
        ceph: result.filter(d => d.status === "CEPH").length,
        os: result.filter(d => d.status === "OS").length,
        stale: result.filter(d => d.status === "STALE").length
      }
    });

  } catch (err) {
    console.error("ERROR:", err);
    return res.status(500).json({
      status: "failed",
      error: err.message
    });
  }
});

app.post("/api/disk/clean-osd", async (req, res) => {
  try {
    const { node, disk } = req.body;

    if (!node || !disk) {
      return res.status(400).json({
        error: "node and disk are required"
      });
    }

    const jobName = "clean-osd-" + Date.now();

    const job = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: jobName,
        namespace: ns
      },
      spec: {
        backoffLimit: 0,
        template: {
          spec: {
            nodeName: node,
            restartPolicy: "Never",
            hostPID: true,
            hostNetwork: true,
            hostIPC: true,
            containers: [
              {
                name: "cleaner",
                image: "quay.io/ceph/ceph:v18",
                securityContext: {
                  privileged: true
                },
                command: [
                  "/bin/bash",
                  "-c",
                  `
echo "Starting Deep Disk Cleanup on ${disk}"

# Improved unmount logic: 
# We use 'nsenter' to run the unmount command in the HOST's mount namespace (PID 1)
echo "[1/7] Forcefully unmounting from Host Namespace..."
nsenter -t 1 -m -u -i -n -p -- umount -l ${disk} || true
nsenter -t 1 -m -u -i -n -p -- umount -l ${disk}* || true

# Check if it worked
if grep -q "${disk}" /proc/1/mounts; then
    echo "ERROR: Disk is still mounted on host. Cleanup will fail."
else
    echo "Success: Disk unmounted."
fi

echo "[2/7] Removing LVM..."
pvremove -y -ff ${disk}* || true

echo "[3/7] Zapping..."
sgdisk --zap-all ${disk}
sgdisk --clear --mbrtogpt ${disk}

echo "[4/7] Wipefs..."
wipefs -a ${disk} || wipefs -f -a ${disk}

echo "[5/7] Partprobe..."
partprobe ${disk}

echo "[6/7] Blkdiscard..."
blkdiscard ${disk} || true

echo "[7/7] Verification..."
lsblk ${disk}
                  `
                ],
                volumeMounts: [
                  {
                    name: "hostdev",
                    mountPath: "/dev"
                  }
                ]
              }
            ],
            volumes: [
              {
                name: "hostdev",
                hostPath: {
                  path: "/dev"
                }
              }
            ]
          }
        }
      }
    };

    await batch.createNamespacedJob({
      namespace: ns,
      body: job
    });

    // wait pod create
    await new Promise(r => setTimeout(r, 5000));

    const pods = await core.listNamespacedPod({
      namespace: ns
    });

    const pod = pods.items.find(p =>
      p.metadata.name.includes(jobName)
    );

    if (!pod) {
      return res.status(500).json({
        error: "cleanup pod not found"
      });
    }

    const podName = pod.metadata.name;

    // wait job complete
  let completed = false;
  let attempts = 0;

  while (!completed && attempts < 30) {
    const podStatus = await core.readNamespacedPod({
      name: podName,
      namespace: ns
    });

    const phase = podStatus.status.phase;

    if (phase === "Succeeded" || phase === "Failed") {
      completed = true;
      break;
    }

    await new Promise(r => setTimeout(r, 2000));
    attempts++;
  }

  const logs = await core.readNamespacedPodLog({
    name: podName,
    namespace: ns
  });

    res.json({
      status: "success",
      node,
      disk,
      job: jobName,
      pod: podName,
      message: "Disk cleaned successfully and ready for Ceph OSD",
      logs
    });

  } catch (err) {
    console.log("CLEAN OSD ERROR:", err);

    res.status(500).json({
      status: "failed",
      error: err.message
    });
  }
});

app.post("/api/osd/purge-safe", async (req, res) => {
  const osdId = req.body.osd_id;
  const force = req.body.force || false;

  if (osdId === undefined || osdId === null) {
    return res.status(400).json({
      error: "osd_id is required"
    });
  }

  const logs = [];

  try {
    logs.push(`Starting SAFE purge for OSD ${osdId}`);

    // =========================
    // STEP 0 - FORCE: CLEAN K8S FIRST
    // =========================
    if (force) {
      logs.push("FORCE mode enabled → cleaning Kubernetes deployment first");

      try {
        const depList = await apps.listNamespacedDeployment({
          namespace: ns
        });

        const dep = depList.items.find(d =>
          d.metadata.name.includes(`osd-${osdId}`)
        );

        if (dep) {
          await apps.deleteNamespacedDeployment({
            name: dep.metadata.name,
            namespace: ns
          });

          logs.push(`Deployment deleted: ${dep.metadata.name}`);
        } else {
          logs.push("No deployment found for this OSD");
        }

      } catch (err) {
        logs.push(`Deployment cleanup error: ${err.message}`);
      }

      logs.push("Waiting 5 sec after deployment cleanup...");
      await sleep(5000);
    }

    // =========================
    // STEP 1 - CHECK OSD IN CEPH (SAFE CHECK)
    // =========================
    let osdExists = false;

    try {
      const find = await execInToolbox(`ceph osd find ${osdId}`);
      osdExists =
        !!find.stdout &&
        !find.stdout.includes("does not exist");
    } catch (err) {
      osdExists = false;
      logs.push("Ceph osd find failed (treating as not found)");
    }

    if (!osdExists) {
      logs.push("OSD not found in Ceph");

      if (!force) {
        return res.status(404).json({
          status: "failed",
          error: "OSD not found",
          logs
        });
      }

      logs.push("Force mode → continuing cleanup without Ceph dependency");
    } else {
      logs.push("OSD found in Ceph");

      // =========================
      // STEP 2 - GET OSD TREE
      // =========================
      const tree = await execInToolbox("ceph osd tree");
      logs.push("Fetched OSD tree");

      const isUp =
        tree.stdout.includes(`osd.${osdId}`) &&
        tree.stdout.includes("up");

      // =========================
      // STEP 3 - MARK OUT
      // =========================
      if (isUp) {
        logs.push("OSD active → marking OUT");

        await execInToolbox(`ceph osd out ${osdId}`);

        logs.push("OSD marked OUT");
      }
    }

    // =========================
    // STEP 4 - MARK DOWN (SAFE)
    // =========================
    logs.push("Marking OSD DOWN");

    try {
      await execInToolbox(`ceph osd down ${osdId}`);
      logs.push("OSD marked DOWN");
    } catch (err) {
      logs.push("OSD already DOWN or not present");
    }

    // =========================
    // STEP 5 - FINAL CHECK
    // =========================
    const finalCheck = await execInToolbox("ceph osd tree");

    const stillUp =
      finalCheck.stdout.includes(`osd.${osdId}`) &&
      finalCheck.stdout.includes("up");

    if (stillUp && !force) {
      return res.status(400).json({
        status: "failed",
        error: "OSD still active. Use force=true if required.",
        logs
      });
    }

    if (stillUp && force) {
      logs.push("Force mode enabled → continuing purge");
    }

    // =========================
    // STEP 6 - PURGE
    // =========================
    logs.push("Purging OSD");

    const purge = await execInToolbox(
      `ceph osd purge ${osdId} --yes-i-really-mean-it`
    );

    logs.push("OSD purged");

    return res.json({
      status: "success",
      osd_id: osdId,
      force,
      logs,
      output: purge.stdout
    });

  } catch (err) {
    return res.status(500).json({
      status: "failed",
      error: err.message,
      logs
    });
  }
});

/* ---------------------------
   Start Server
----------------------------*/
app.listen(3000, () => {
  console.log("====================================");
  console.log("Rook Ceph API started on port 3000");
  console.log("Namespace:", ns);
  console.log("Toolbox Pod Match:", toolboxName);
  console.log("====================================");
});