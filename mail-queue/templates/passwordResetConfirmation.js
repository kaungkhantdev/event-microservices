/**
 * Password Reset Confirmation Email Template
 * Priority: 2 (HIGH)
 *
 * This template is sent after a user successfully resets their password.
 */

const Handlebars = require('handlebars');

const passwordResetConfirmationTemplate = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #ffffff;
              border-radius: 8px;
              padding: 40px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .header h1 {
              color: #0f9d58;
              margin: 0;
            }
            .success-icon {
              font-size: 48px;
              text-align: center;
              margin: 20px 0;
            }
            .content {
              margin-bottom: 30px;
            }
            .info-box {
              background-color: #e8f5e9;
              border-left: 4px solid #0f9d58;
              padding: 12px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .warning-box {
              background-color: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 12px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e0e0e0;
              font-size: 12px;
              color: #666;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>

            <div class="header">
              <h1>Password Successfully Reset</h1>
            </div>

            <div class="content">
              <p>Hi {{name}},</p>

              <div class="info-box">
                <strong>Your password has been successfully changed.</strong>
              </div>

              <p>This confirms that the password for your account <strong>{{email}}</strong> was reset on:</p>
              <p><strong>{{resetDate}}</strong></p>

              <div class="warning-box">
                <p><strong>⚠️ Didn't make this change?</strong></p>
                <p>If you didn't reset your password, please contact our support team immediately. Your account may be compromised.</p>
              </div>

              <p><strong>Security Tips:</strong></p>
              <ul>
                <li>Use a unique password for this account</li>
                <li>Enable two-factor authentication if available</li>
                <li>Never share your password with anyone</li>
                <li>Change your password regularly</li>
              </ul>
            </div>

            <div class="footer">
              <p>This is an automated security notification.</p>
              <p>If you have questions, contact our support team.</p>
            </div>
          </div>
        </body>
      </html>
`;

module.exports = Handlebars.compile(passwordResetConfirmationTemplate);
