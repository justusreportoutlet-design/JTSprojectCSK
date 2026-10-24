import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const rootDir = process.cwd();

const BACKUPS_DIR = path.join(rootDir, "backups");
const DATA_DIR = path.join(rootDir, "data_store");
const OUTLETS_FILE = path.join(DATA_DIR, "outlets.json");
const SYSTEM_CONFIG_FILE = path.join(DATA_DIR, "system_config.json");

// Ensure directories exist
try {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Could not create storage directories:", e);
}

const DEFAULT_SYNC_OUTLETS = [
  { id: 'SH CIPETE', name: 'SH CIPETE', area: 'JAKARTA', type: 'REGULAR OUTLET' },
  { id: 'SH KEMANG', name: 'SH KEMANG', area: 'JAKARTA', type: 'REGULAR OUTLET' },
  { id: 'SH LEBAK BULUS', name: 'SH LEBAK BULUS', area: 'JAKARTA', type: 'REGULAR OUTLET' },
  { id: 'SH ALAM SUTERA', name: 'SH ALAM SUTERA', area: 'TANGGERANG', type: 'PRIME OUTLET' },
  { id: 'SH BINTARO', name: 'SH BINTARO', area: 'TANGGERANG', type: 'REGULAR OUTLET' },
  { id: 'SH THE BARN', name: 'SH THE BARN', area: 'TANGGERANG', type: 'PRIME OUTLET' },
  { id: 'SH BEKASI', name: 'SH BEKASI', area: 'BEKASI', type: 'REGULAR OUTLET' },
  { id: 'SH CIBUBUR', name: 'SH CIBUBUR', area: 'BEKASI', type: 'REGULAR OUTLET' }
];

function readOutletsData(): Record<string, any> {
  try {
    if (fs.existsSync(OUTLETS_FILE)) {
      return JSON.parse(fs.readFileSync(OUTLETS_FILE, "utf-8"));
    }
  } catch (err) {
    console.warn("Failed reading outlets.json:", err);
  }
  return {};
}

function writeOutletsData(data: Record<string, any>) {
  try {
    const tempFile = `${OUTLETS_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempFile, OUTLETS_FILE);
  } catch (err) {
    console.error("Failed writing outlets.json:", err);
  }
}

function readSystemConfig(): any {
  try {
    if (fs.existsSync(SYSTEM_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(SYSTEM_CONFIG_FILE, "utf-8"));
    }
  } catch (err) {
    console.warn("Failed reading system_config.json:", err);
  }
  return {
    outlets: DEFAULT_SYNC_OUTLETS,
    maxDailyInputs: 2500,
    onlineTimeLimit: 1440,
    maxOnlineUsers: 10,
    updatedAt: new Date().toISOString()
  };
}

function writeSystemConfig(data: any) {
  try {
    const tempFile = `${SYSTEM_CONFIG_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempFile, SYSTEM_CONFIG_FILE);
  } catch (err) {
    console.error("Failed writing system_config.json:", err);
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  // In the development sandbox, DEFAULT_APP_PORT is 3000 behind nginx reverse proxy.
  // When deployed live to Cloud Run, Cloud Run sets PORT (usually 8080) and checks health on that port.
  const PORT = process.env.DEFAULT_APP_PORT
    ? parseInt(process.env.DEFAULT_APP_PORT, 10)
    : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

  app.use(express.json({ limit: '50mb' }));

  // Health checks for Cloud Run & monitoring probes
  app.get(["/api/health", "/health", "/healthz", "/_health"], (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // In-memory active presence tracker (eliminates 14,000+ redundant Firestore writes per day!)
  const activePresenceUsers = new Map<string, { uid: string; email: string; outlet: string; lastSeen: string; timestamp: number }>();

  app.post("/api/presence", (req, res) => {
    try {
      const { uid, email, outlet } = req.body;
      if (uid) {
        activePresenceUsers.set(uid, {
          uid,
          email: email || 'anonymous',
          outlet: outlet || 'UNKNOWN',
          lastSeen: new Date().toISOString(),
          timestamp: Date.now()
        });
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update presence" });
    }
  });

  app.get("/api/presence", (_req, res) => {
    try {
      const now = Date.now();
      const cutoff = now - 15 * 60 * 1000; // 15 minutes inactive threshold
      const activeList: any[] = [];
      activePresenceUsers.forEach((user, uid) => {
        if (user.timestamp > cutoff) {
          activeList.push(user);
        } else {
          activePresenceUsers.delete(uid);
        }
      });
      res.json({ success: true, users: activeList });
    } catch {
      res.status(500).json({ error: "Failed to get presence" });
    }
  });

  // --- Real-time High-Availability Cross-Device Sync API ---
  // Guarantees all devices (PC, mobile, tablet) and Regional Page stay in sync with zero latency
  app.get("/api/sync/all-outlets", (_req, res) => {
    try {
      const outlets = readOutletsData();
      res.json({ success: true, outlets });
    } catch (error) {
      console.error("Error reading all outlets:", error);
      res.status(500).json({ error: "Failed to read outlets" });
    }
  });

  app.get("/api/sync/outlet/:outletId", (req, res) => {
    try {
      const { outletId } = req.params;
      const outlets = readOutletsData();
      res.json({ success: true, outlet: outlets[outletId] || null });
    } catch (error) {
      console.error(`Error reading outlet ${req.params.outletId}:`, error);
      res.status(500).json({ error: "Failed to read outlet" });
    }
  });

  app.post("/api/sync/outlet/:outletId", (req, res) => {
    try {
      const { outletId } = req.params;
      const { data, email, extraGlobal } = req.body;
      const outlets = readOutletsData();
      const existing = outlets[outletId] || { monthlyData: {} };
      const existingMonthly = { ...(existing.monthlyData || {}) };

      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([mKey, mVal]) => {
          // Only store clean numeric month keys 0..11 in monthlyData!
          const mNum = parseInt(mKey, 10);
          if (!isNaN(mNum) && mNum >= 0 && mNum <= 11 && mVal && typeof mVal === 'object') {
            // Strip any nested monthlyData or invalid keys
            const { monthlyData: _ignored, ...cleanMonth } = mVal as any;
            existingMonthly[mKey] = cleanMonth;
          }
        });
      }

      // Propagate top-level global fields
      if (extraGlobal && typeof extraGlobal === 'object') {
        const allowedGlobals = [
          'staffList', 'leaveRecords', 'dailyOvertime', 'weeklyOvertime', 'dailyAttendance',
          'dailyExternalAudit', 'dailyCPA', 'dailyGSI', 'guestComplaints',
          'affiliateHistory', 'manpowerData'
        ];
        allowedGlobals.forEach(gKey => {
          if (extraGlobal[gKey] !== undefined) {
            existing[gKey] = extraGlobal[gKey];
          }
        });
      }

      existing.monthlyData = existingMonthly;
      existing.isDeleted = false;
      existing.updatedAt = new Date().toISOString();
      existing.lastUpdatedBy = (email || 'outlet-sync').toLowerCase();

      outlets[outletId] = existing;
      writeOutletsData(outlets);

      res.json({ 
        success: true, 
        updatedAt: existing.updatedAt,
        outletId
      });
    } catch (error) {
      console.error(`Error saving outlet ${req.params.outletId}:`, error);
      res.status(500).json({ error: "Failed to save outlet data" });
    }
  });

  app.get("/api/sync/system-config", (_req, res) => {
    try {
      const config = readSystemConfig();
      res.json({ success: true, config });
    } catch (error) {
      res.status(500).json({ error: "Failed to read system config" });
    }
  });

  app.post("/api/sync/system-config", (req, res) => {
    try {
      const updates = req.body;
      const current = readSystemConfig();
      const next = { ...current, ...updates, updatedAt: new Date().toISOString() };
      writeSystemConfig(next);
      res.json({ success: true, config: next });
    } catch (error) {
      res.status(500).json({ error: "Failed to update system config" });
    }
  });

  // Get list of backups
  app.get("/api/backups", (req, res) => {
    try {
      const files = fs.readdirSync(BACKUPS_DIR);
      const backups = files
        .filter(f => f.endsWith(".json"))
        .map(f => {
          const stats = fs.statSync(path.join(BACKUPS_DIR, f));
          return {
            id: f.replace(".json", ""),
            name: `Backup ${f.replace(".json", "").replace(/_/g, " ")}`,
            timestamp: stats.mtime.toISOString()
          };
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      
      res.json({ backups });
    } catch (error) {
      res.status(500).json({ error: "Failed to list backups" });
    }
  });

  // Create a backup
  app.post("/api/backups", (req, res) => {
    try {
      const { data, outletId } = req.body;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${outletId || "global"}_${timestamp}.json`;
      fs.writeFileSync(path.join(BACKUPS_DIR, filename), JSON.stringify(data, null, 2));
      
      // Keep only last 30 backups
      const files = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.endsWith(".json"))
        .map(f => ({ name: f, time: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);
      
      if (files.length > 30) {
        files.slice(30).forEach(f => fs.unlinkSync(path.join(BACKUPS_DIR, f.name)));
      }

      res.json({ success: true, id: filename.replace(".json", "") });
    } catch (error) {
      res.status(500).json({ error: "Failed to create backup" });
    }
  });

  // Restore a backup
  app.post("/api/backups/restore/:backupId", (req, res) => {
    try {
      const { backupId } = req.params;
      const filePath = path.join(BACKUPS_DIR, `${backupId}.json`);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Backup not found" });
      }
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ error: "Failed to restore backup" });
    }
  });

  // Determine whether to run in dev mode with Vite or serve production static build
  const distDir = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distDir, 'index.html'));
  const isDev = process.env.npm_lifecycle_event === 'dev' || 
                (!hasDist && process.env.NODE_ENV !== 'production');

  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve built static files directly with caching
    app.use(express.static(distDir, {
      maxAge: '1h'
    }));

    // SPA fallback route for any client-side navigation
    app.get("*all", (_req, res) => {
      const indexPath = path.join(distDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Not Found");
      }
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (${isDev ? 'development' : 'production'})`);
  });

  const shutdown = () => {
    httpServer.close(() => {
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception in server:", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection in server:", reason);
  });
}

startServer();
