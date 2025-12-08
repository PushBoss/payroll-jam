
# Payroll-Jam 🇯🇲

A modern, AI-powered payroll and HR SaaS platform built specifically for the Jamaican business landscape.

## 🚀 Features

*   **Payroll Engine:** Automated calculation of NIS, NHT, Education Tax, and PAYE (2025 Thresholds). Supports Weekly, Fortnightly, and Monthly cycles.
*   **Compliance:** Auto-generation of S01 (Monthly) and S02 (Annual) remittance forms.
*   **Employee Portal:** Self-service access for payslips, leave requests, and document generation.
*   **HR Tools:** Asset tracking, performance reviews, and digital employment contracts.
*   **Reseller & Super Admin:** Dedicated portals for payroll bureaus and platform administration.
*   **AI Assistant:** "JamBot" for labor law queries and data analysis.

## 🛠️ Tech Stack

*   **Frontend:** React 18, TypeScript, Vite
*   **Styling:** Tailwind CSS
*   **State Management:** React State + LocalStorage (Architecture designed for easy migration to Supabase/Postgres)
*   **AI:** Generative AI Integration
*   **Charts:** Recharts
*   **Payments:** Dime Pay SDK, PayPal SDK

## 📦 Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/payroll-jam.git
    cd payroll-jam
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    Create a `.env` file in the root directory:
    ```env
    # Supabase Configuration (Required for Live Mode)
    VITE_SUPABASE_URL=your_project_url
    VITE_SUPABASE_ANON_KEY=your_anon_key

    # AI Integration (Optional)
    API_KEY=your_ai_provider_key
    ```

4.  **Run Locally**
    ```bash
    npm run dev
    ```

## 🌍 Deployment (Vercel)

1.  Push code to GitHub.
2.  Import project into Vercel.
3.  Add Environment Variables:
    *   `VITE_SUPABASE_URL`
    *   `VITE_SUPABASE_ANON_KEY`
    *   `API_KEY`
4.  Deploy.

## 🔐 Default Login Credentials (Demo)

| Role | Email | Password |
|------|-------|----------|
| **Super Admin** | `super@jam.com` | *any* |
| **Reseller** | `reseller@jam.com` | *any* |
| **Company Admin** | `admin@jam.com` | *any* |
| **Employee** | `lightning@track.jm` | *any* |

## 📜 License

Proprietary software designed for the Jamaican market.
