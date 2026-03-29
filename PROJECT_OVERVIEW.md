# Project Overview: Payroll-Jam

## 1. Vision & Purpose
Payroll-Jam is a high-precision, cloud-native payroll and human capital management (HCM) platform specifically engineered for the Jamaican market. It automates the complexities of Jamaican statutory compliance, including NIS, NHT, Education Tax, and PAYE, while providing tools for employee engagement and reseller management.

## 2. Core Business Components
- **Payroll Engine**: Automated calculation of gross-to-net salary based on current Jamaican tax brackets.
- **Statutory Compliance**: Generation of data for S01/S02 filings and tracking of monthly tax deadlines (14th of every month).
- **Employee Lifecycle**: From onboarding wizards to professional performance reviews and termination processing.
- **Multi-Tenant Reseller System**: Allows accounting firms and resellers to manage multiple client companies with custom commissions and white-labeled support.
- **JamBot AI**: An integrated HR assistant grounded in Jamaican labor law and platform-specific knowledge.

## 3. Likely User Personas
- **Company Owners**: Small to medium business owners managing their own team.
- **HR/Payroll Managers**: Operational leads handling complex monthly pay runs and statutory filings.
- **Employees**: Individual workers accessing payslips, leave requests, and tax documents via the portal.
- **Resellers**: Professional accountants or consultants managing portfolios of client businesses.
- **Platform Admins (SuperAdmin)**: Internal team managing global configuration, pricing plans, and system maintenance.

## 4. Key User Journeys
1. **Company Onboarding**: Signup -> Company Profile -> Plan Selection -> Employee Import -> First Pay Run.
2. **Monthly Payroll Cycle**: Timesheet Approval -> Pay Run Initialization -> Tax Calculation -> Finalization -> Payslip Distribution.
3. **Compliance Filing**: Generate Statutory Report -> Export to TAJ format -> Record Payment Status.
4. **Reseller Management**: Dashboard view of client portfolio -> Compliance status monitoring -> Revenue/Profit analysis.

## 5. Technology Stack
- **Frontend**: React (18), TypeScript, Vite, Tailwind CSS.
- **Backend/DB**: Supabase (PostgreSQL), Row Level Security (RLS).
- **Serverless**: Supabase Edge Functions & Vercel Functions.
- **AI**: Gemini 1.5 Flash (via Google Generative AI & Edge Functions).
- **Payments**: DimePay (primary), PayPal/Stripe (optional).
- **Communication**: Brevo (SMTP) / EmailJS.
