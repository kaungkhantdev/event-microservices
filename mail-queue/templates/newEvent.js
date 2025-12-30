const Handlebars = require('handlebars');

const newEventTemplate = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .event-details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Event Created!</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>A new event has been created:</p>
      <div class="event-details">
        <h2>{{title}}</h2>
        <p><strong>Start Date:</strong> {{startDate}}</p>
        {{#if location}}
        <p><strong>Location:</strong> {{location}}</p>
        {{/if}}
        {{#if description}}
        <p><strong>Description:</strong> {{description}}</p>
        {{/if}}
      </div>
      <p>We look forward to seeing you there!</p>
    </div>
    <div class="footer">
      <p>This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
`;

module.exports = Handlebars.compile(newEventTemplate);
