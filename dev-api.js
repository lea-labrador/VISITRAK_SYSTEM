import { createServer } from "node:http";

/* global process */

import cleanupTokens from "./api/cleanup-tokens.js";
import completePasswordReset from "./api/complete-password-reset.js";
import adminResetOfficePassword from "./api/admin-reset-office-password.js";
import createOfficeAccount from "./api/create-office-account.js";
import deleteOfficeAccount from "./api/delete-office-account.js";
import firestoreUsage from "./api/firestore-usage.js";
import officePasswordResetRequests from "./api/office-password-reset-requests.js";
import officeChangePassword from "./api/office-change-password.js";
import officeLogin from "./api/office-login.js";
import resolveOfficePasswordResetRequest from "./api/resolve-office-password-reset-request.js";
import updateOfficeAccount from "./api/update-office-account.js";

const PORT = Number(process.env.PORT || 5001);

const routes = {
  "/api/admin-reset-office-password": adminResetOfficePassword,
  "/api/create-office-account": createOfficeAccount,
  "/api/update-office-account": updateOfficeAccount,
  "/api/delete-office-account": deleteOfficeAccount,
  "/api/office-login": officeLogin,
  "/api/office-change-password": officeChangePassword,
  "/api/office-password-reset-requests": officePasswordResetRequests,
  "/api/resolve-office-password-reset-request": resolveOfficePasswordResetRequest,
  "/api/complete-password-reset": completePasswordReset,
  "/api/cleanup-tokens": cleanupTokens,
  "/api/firestore-usage": firestoreUsage,
};

const readBody = async (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });

const createResponseAdapter = (res) => ({
  setHeader: (name, value) => {
    res.setHeader(name, value);
  },
  status: (code) => {
    res.statusCode = code;
    return createResponseAdapter(res);
  },
  json: (data) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify(data));
  },
  end: () => res.end(),
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname;

  if (path === "/api/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: true,
        message: "Local API server is running",
        port: PORT,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  const handler = routes[path];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        message: `Route not found: ${path}`,
      })
    );
    return;
  }

  req.body = await readBody(req);
  const adaptedRes = createResponseAdapter(res);

  try {
    await handler(req, adaptedRes);
  } catch (error) {
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          message: "Local API error.",
          error: error?.message,
        })
      );
    }
  }
});

server.listen(PORT, () => {
});
