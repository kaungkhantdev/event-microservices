const Handlebars = require('handlebars');

const registrationTemplate = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .welcome-box { background-color: white; padding: 20px; margin: 15px 0; text-align: center; border-radius: 5px; }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background-color: #2196F3;
      color: white;
      text-decoration: none;
      border-radius: 5px;
      margin: 20px 0;
    }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Our Platform!</h1>
    </div>
    <div class="content">
      <div class="welcome-box">
        <h2>Hello {{name}}!</h2>
        <p>Thank you for registering with us. Your account has been created successfully.</p>
      </div>
      <p><strong>Your Account Details:</strong></p>
      <ul>
        <li>Email: {{email}}</li>
        <li>Registration Date: {{registrationDate}}</li>
      </ul>
      <div style="text-align: center;">
        <a href="{{loginLink}}" class="button">Get Started</a>
      </div>
      <p>If you have any questions or need assistance, feel free to contact our support team.</p>
    </div>
    <div class="footer">
      <p>This is an automated email. Please do not reply.</p>
      <p>&copy; {{year}} All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

module.exports = Handlebars.compile(registrationTemplate);
