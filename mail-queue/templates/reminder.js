const Handlebars = require('handlebars');

const reminderTemplate = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #FFC107; color: #333; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .reminder-box {
      background-color: white;
      padding: 20px;
      margin: 15px 0;
      border-left: 4px solid #FFC107;
      border-radius: 5px;
    }
    .time-info {
      background-color: #fff3cd;
      padding: 15px;
      margin: 15px 0;
      border-radius: 5px;
      text-align: center;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background-color: #FFC107;
      color: #333;
      text-decoration: none;
      border-radius: 5px;
      margin: 20px 0;
      font-weight: bold;
    }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔔 Event Reminder</h1>
    </div>
    <div class="content">
      <p>Hello {{name}},</p>
      <p>This is a friendly reminder about your upcoming event:</p>
      <div class="reminder-box">
        <h2>{{eventTitle}}</h2>
        {{#if eventDescription}}
        <p>{{eventDescription}}</p>
        {{/if}}
        <p><strong>📅 Date:</strong> {{eventDate}}</p>
        <p><strong>⏰ Time:</strong> {{eventTime}}</p>
        {{#if location}}
        <p><strong>📍 Location:</strong> {{location}}</p>
        {{/if}}
      </div>
      <div class="time-info">
        <h3>Starting in {{timeUntilEvent}}</h3>
      </div>
      <div style="text-align: center;">
        <a href="{{eventLink}}" class="button">View Event Details</a>
      </div>
      <p>Don't forget to mark your calendar!</p>
    </div>
    <div class="footer">
      <p>This is an automated reminder. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
`;

module.exports = Handlebars.compile(reminderTemplate);
