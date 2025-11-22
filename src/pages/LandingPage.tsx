/**
 * Memory-as-a-Service Landing Page Component
 * Features Lanonasis MaaS platform with proper routing integration
 */

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Handle OAuth callback on main page - redirect to auth handler
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const access_token = urlParams.get("access_token");
    const error = urlParams.get("error");

    if (code || access_token || error) {
      console.log(
        "OAuth callback detected on main landing page - redirecting to auth handler"
      );
      navigate(`/auth/callback${window.location.search}`);
    }
  }, [navigate]);

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate("/dashboard");
    } else {
      navigate("/signup");
    }
  };

  const handleLogin = () => {
    navigate("/login");
  };
  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        boxSizing: "border-box",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: "#0A1930",
        color: "#ffffff",
        lineHeight: 1.6,
        overflowX: "hidden",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "20px 0",
          background: "rgba(10, 25, 48, 0.95)",
          backdropFilter: "blur(10px)",
          position: "sticky",
          top: 0,
          zIndex: 1000,
        }}
      >
        <div
          style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px" }}
        >
          <nav
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                color: "#00D4AA",
              }}
            >
              LanOnasis
            </div>
            <ul
              style={{
                display: "flex",
                gap: "30px",
                listStyle: "none",
                margin: 0,
                padding: 0,
              }}
            >
              <li>
                <a
                  href="#features"
                  style={{ color: "#ffffff", textDecoration: "none" }}
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#developer"
                  style={{ color: "#ffffff", textDecoration: "none" }}
                >
                  Developers
                </a>
              </li>
              <li>
                <a
                  href="https://docs.lanonasis.com"
                  style={{ color: "#ffffff", textDecoration: "none" }}
                >
                  Docs
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  style={{ color: "#ffffff", textDecoration: "none" }}
                >
                  Pricing
                </a>
              </li>
            </ul>
            <div style={{ display: "flex", gap: "15px" }}>
              <button
                onClick={handleLogin}
                style={{
                  padding: "12px 24px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "2px solid #00D4AA",
                  color: "#00D4AA",
                  background: "transparent",
                }}
              >
                Sign In
              </button>
              <button
                onClick={handleGetStarted}
                style={{
                  padding: "12px 24px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "none",
                  background: "linear-gradient(135deg, #00D4AA, #00B4D8)",
                  color: "#ffffff",
                }}
              >
                Get Started
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section
        style={{
          padding: "100px 0 80px",
          textAlign: "center",
          position: "relative",
        }}
      >
        <div
          style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px" }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(0, 212, 170, 0.1)",
              border: "1px solid rgba(0, 212, 170, 0.3)",
              padding: "8px 16px",
              borderRadius: "50px",
              fontSize: "0.9rem",
              marginBottom: "30px",
              color: "#00D4AA",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                background: "#00D4AA",
                borderRadius: "50%",
              }}
            ></span>
            Introducing Lanonasis
          </div>

          <h1
            style={{
              fontSize: "3.5rem",
              fontWeight: 700,
              marginBottom: "25px",
              background: "linear-gradient(135deg, #ffffff, #00D4AA)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              lineHeight: 1.2,
            }}
          >
            Context-as-a-Service Platform
            <br />
            for AI Applications
          </h1>

          <p
            style={{
              fontSize: "1.3rem",
              color: "rgba(255, 255, 255, 0.8)",
              maxWidth: "600px",
              margin: "0 auto 40px",
            }}
          >
            Vector-enabled context storage, secure API key management, and MCP
            integration for building intelligent AI applications.
          </p>

          <div
            style={{
              display: "flex",
              gap: "20px",
              justifyContent: "center",
              marginBottom: "60px",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleGetStarted}
              style={{
                padding: "12px 24px",
                borderRadius: "8px",
                fontWeight: 500,
                cursor: "pointer",
                border: "none",
                background: "linear-gradient(135deg, #00D4AA, #00B4D8)",
                color: "#ffffff",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              Get Started
              <span>→</span>
            </button>
            <a
              href="#features"
              style={{
                padding: "12px 24px",
                borderRadius: "8px",
                fontWeight: 500,
                cursor: "pointer",
                border: "2px solid #00D4AA",
                color: "#00D4AA",
                background: "transparent",
                textDecoration: "none",
              }}
            >
              Learn More
            </a>
          </div>

          {/* Browser Preview */}
          <div
            style={{
              maxWidth: "900px",
              margin: "0 auto",
              background: "#1a2332",
              borderRadius: "12px",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div
              style={{
                height: "50px",
                background: "#2a3441",
                display: "flex",
                alignItems: "center",
                padding: "0 20px",
              }}
            >
              <div style={{ display: "flex", gap: "8px" }}>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: "#ff5f56",
                  }}
                ></div>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: "#ffbd2e",
                  }}
                ></div>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: "#27c93f",
                  }}
                ></div>
              </div>
              <div
                style={{
                  flex: 1,
                  textAlign: "center",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                }}
              >
                dashboard.lanonasis.com
              </div>
            </div>
            <div
              style={{
                padding: "40px",
                background: "linear-gradient(135deg, #1a2332, #0f1419)",
                color: "#ffffff",
                textAlign: "center",
              }}
            >
              <h3>🚀 Context Dashboard</h3>
              <p>Manage context, API keys, and integrations</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        style={{
          padding: "100px 0",
          background: "#0f1419",
        }}
      >
        <div
          style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px" }}
        >
          <h2
            style={{
              textAlign: "center",
              fontSize: "2.5rem",
              fontWeight: 700,
              marginBottom: "20px",
              color: "#ffffff",
            }}
          >
            Platform Services
          </h2>
          <p
            style={{
              textAlign: "center",
              fontSize: "1.2rem",
              color: "rgba(255, 255, 255, 0.7)",
              maxWidth: "600px",
              margin: "0 auto 60px",
            }}
          >
            Complete toolkit for building intelligent applications with context management,
            security, and seamless integrations.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
              gap: "30px",
            }}
          >
            {/* Memory as a Service */}
            <div
              style={{
                background: "rgba(26, 35, 50, 0.8)",
                border: "1px solid rgba(0, 212, 170, 0.2)",
                borderRadius: "12px",
                padding: "40px 30px",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  background: "linear-gradient(135deg, #00D4AA, #00B4D8)",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "25px",
                  fontSize: "1.5rem",
                }}
              >
                ⚡
              </div>
              <h3
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 600,
                  marginBottom: "15px",
                  color: "#ffffff",
                }}
              >
                Context-as-a-Service
              </h3>
              <p
                style={{
                  color: "rgba(255, 255, 255, 0.7)",
                  marginBottom: "25px",
                }}
              >
                Vector-enabled context storage for AI agents with semantic
                search, bulk operations, and hierarchical organization.
              </p>
            </div>

            {/* API Key Management */}
            <div
              style={{
                background: "rgba(26, 35, 50, 0.8)",
                border: "1px solid rgba(0, 212, 170, 0.2)",
                borderRadius: "12px",
                padding: "40px 30px",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  background: "linear-gradient(135deg, #00D4AA, #00B4D8)",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "25px",
                  fontSize: "1.5rem",
                }}
              >
                🛡️
              </div>
              <h3
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 600,
                  marginBottom: "15px",
                  color: "#ffffff",
                }}
              >
                Productivity Tool Integrations
              </h3>
              <p
                style={{
                  color: "rgba(255, 255, 255, 0.7)",
                  marginBottom: "25px",
                }}
              >
                Connect to Notion, Slack, Google Workspace, GitHub, and more via
                MCP protocol with secure API key management.
              </p>
            </div>

            {/* Developer Dashboard */}
            <div
              style={{
                background: "rgba(26, 35, 50, 0.8)",
                border: "1px solid rgba(0, 212, 170, 0.2)",
                borderRadius: "12px",
                padding: "40px 30px",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  background: "linear-gradient(135deg, #00D4AA, #00B4D8)",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "25px",
                  fontSize: "1.5rem",
                }}
              >
                📊
              </div>
              <h3
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 600,
                  marginBottom: "15px",
                  color: "#ffffff",
                }}
              >
                Management Dashboard
              </h3>
              <p
                style={{
                  color: "rgba(255, 255, 255, 0.7)",
                  marginBottom: "25px",
                }}
              >
                Interactive dashboard for managing context, API keys, and
                monitoring usage with real-time analytics.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section
        style={{
          padding: "100px 0",
          background: "linear-gradient(135deg, #00D4AA, #00B4D8)",
          textAlign: "center",
        }}
      >
        <div
          style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px" }}
        >
          <h2
            style={{
              fontSize: "2.5rem",
              fontWeight: 700,
              marginBottom: "20px",
              color: "#ffffff",
            }}
          >
            Start Building Smarter Applications Today
          </h2>
          <p
            style={{
              fontSize: "1.2rem",
              color: "rgba(255, 255, 255, 0.9)",
              maxWidth: "600px",
              margin: "0 auto 40px",
            }}
          >
            Get started for free with LanOnasis Context-as-a-Service. No credit card required.
            Connect your tools, manage your context, and deploy AI-powered workflows in minutes.
          </p>

          <div
            style={{
              display: "flex",
              gap: "20px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleGetStarted}
              style={{
                padding: "12px 24px",
                borderRadius: "8px",
                fontWeight: 500,
                cursor: "pointer",
                border: "none",
                background: "#ffffff",
                color: "#0A1930",
              }}
            >
              Sign up free
            </button>
            <button
              onClick={handleLogin}
              style={{
                padding: "12px 24px",
                borderRadius: "8px",
                fontWeight: 500,
                cursor: "pointer",
                border: "2px solid #ffffff",
                color: "#ffffff",
                background: "transparent",
              }}
            >
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          background: "#0f1419",
          padding: "40px 0",
          textAlign: "center",
          borderTop: "1px solid rgba(0, 212, 170, 0.2)",
        }}
      >
        <div
          style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px" }}
        >
          <p style={{ color: "rgba(255, 255, 255, 0.6)" }}>
            <a
              href="https://github.com/lanonasis/lanonasis-maas"
              style={{ color: "#00D4AA", textDecoration: "none" }}
            >
              GitHub Repository
            </a>{" "}
            •
            <a
              href="https://docs.lanonasis.com"
              style={{ color: "#00D4AA", textDecoration: "none" }}
            >
              Documentation
            </a>{" "}
            •
            <a
              href="https://dashboard.lanonasis.com/auth/register"
              style={{ color: "#00D4AA", textDecoration: "none" }}
            >
              Sign Up
            </a>
          </p>
          <p style={{ marginTop: "10px", color: "rgba(255, 255, 255, 0.6)" }}>
            LanOnasis Context-as-a-Service Platform © 2025
          </p>
        </div>
      </footer>
    </div>
  );
};
