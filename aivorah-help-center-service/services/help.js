const Groq = require('groq-sdk');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const SUPPORT_TEAM_EMAIL = 'aivorah24@gmail.com';

// Resend (HTTP API) primary, Gmail SMTP fallback - same pattern already
// proven working in aivorah-students-service/services/mailer.js. Raw Gmail
// SMTP alone was found to hang/fail on Render (outbound SMTP appears
// blocked on this platform's free tier) via a real E2E test timing out at
// 60s+; Resend is HTTP-based and unaffected by that restriction.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = 'Aivorah <noreply@aivorah.ai>';

const SYSTEM_PROMPT = `You are Aivorah's 24/7 Support Assistant — a friendly, helpful support agent for the Aivorah learning platform.

Your job is to answer questions about how the Aivorah platform works. You are NOT a subject tutor — do not teach maths, science, or any academic content.

Topics you can help with:
- XP points: earned by completing lessons (+50 XP), assignments (+75 XP), challenges (+100 XP)
- Levels: increase as XP accumulates; each level needs progressively more XP
- Streaks: log in and complete at least one lesson/challenge every day; missing a day resets streak to 0
- Badges: earned by reaching milestones (e.g. Quick Start = first lesson, Bookworm = 10 topics)
- Learning Paths: curriculum-aligned topics split into Basic / Intermediate / Advanced
- AI Coach: conversational AI tutor for academic questions; personalized to student's level
- Assignments: given by teacher/parent, auto-graded, wrong answers get AI explanation
- Challenges: competitive exam prep, schools can run quarterly challenges
- Schedule: auto-populated from assignments + learning paths
- Progress & Stats: tracks XP, streak, topics explored, study time
- Profile & Avatar: go to Profile in sidebar to change avatar style
- Themes: dark/light/auto available in Settings
- Devices: works on web, tablet, phone — same account syncs everything
- Data & Privacy: data stored securely via Supabase; never sold
- Support: submit a ticket for issues not covered here

Rules:
- Be friendly, concise, and clear
- If asked about academic subjects (maths, science, etc.) say: "For academic questions, please use the AI Coach from the sidebar!"
- Always answer in 2-4 sentences max
- If you don't know something, say "Please submit a support ticket and our team will help you within 24 hours."`;

async function getChatReply(message) {
  try {
    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      temperature: 0.3,
      max_tokens: 256,
    });

    return { reply: response.choices[0].message.content };
  } catch (err) {
    console.error('Help chat error:', err.message);
    return { error: 'Support chat unavailable. Please try again.' };
  }
}

async function sendSupportTicket({ senderEmail, subject, message }) {
  const { EMAIL_USER, EMAIL_PASS } = process.env;
  if (!resend && (!EMAIL_USER || !EMAIL_PASS)) {
    return { success: false, error: 'Email service not configured. Set RESEND_API_KEY (or EMAIL_USER/EMAIL_PASS).' };
  }

  const timestamp = new Date().toISOString();
  const bodyText = [
    'New support ticket submitted.',
    '',
    `Sender Email: ${senderEmail || 'Not provided'}`,
    `Subject: ${subject}`,
    'Message:',
    message,
    '',
    `Timestamp: ${timestamp}`,
  ].join('\n');

  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: SUPPORT_TEAM_EMAIL,
        replyTo: senderEmail || undefined,
        subject: `[Aivorah Support Ticket] ${subject}`,
        text: bodyText,
      });
      if (error) throw new Error(error.message);
      return { success: true, message: 'Support ticket submitted successfully.' };
    } catch (err) {
      console.error('Support ticket email error (resend):', err.message);
      if (!EMAIL_USER || !EMAIL_PASS) {
        return { success: false, error: 'Failed to submit support ticket. Please try again.' };
      }
      // fall through to Gmail SMTP fallback below
    }
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    // Nodemailer's default connectionTimeout is 2 minutes - found via a
    // real E2E test hanging for 60s+ with no response at all. If outbound
    // SMTP is blocked/slow (common on hosting platforms) or the Gmail App
    // Password is wrong, this now fails in ~10s with a real error instead
    // of hanging the whole request indefinitely.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  try {
    await transporter.sendMail({
      from: `"Aivorah Support" <${EMAIL_USER}>`,
      to: SUPPORT_TEAM_EMAIL,
      replyTo: senderEmail || undefined,
      subject: `[Aivorah Support Ticket] ${subject}`,
      text: bodyText,
    });

    return { success: true, message: 'Support ticket submitted successfully.' };
  } catch (err) {
    console.error('Support ticket email error (gmail):', err.message);
    return { success: false, error: 'Failed to submit support ticket. Please try again.' };
  }
}

module.exports = { getChatReply, sendSupportTicket };
