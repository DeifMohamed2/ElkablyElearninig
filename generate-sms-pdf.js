const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Create a PDF document
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 50, left: 50, right: 50 }
});

// Output file path
const outputPath = path.join(__dirname, 'SMS_MESSAGE_EXAMPLES.pdf');

// Pipe the PDF to a file
doc.pipe(fs.createWriteStream(outputPath));

// Helper function to add a section
function addSection(title, fontSize = 16, isBold = true) {
  doc.moveDown(1);
  doc.fontSize(fontSize);
  if (isBold) {
    doc.font('Helvetica-Bold');
  } else {
    doc.font('Helvetica');
  }
  doc.text(title);
  doc.moveDown(0.5);
}

// Helper function to add code block
function addCodeBlock(text, fontSize = 10) {
  doc.font('Courier');
  doc.fontSize(fontSize);
  doc.fillColor('#000000');
  const lines = text.split('\n');
  lines.forEach(line => {
    doc.text(line, { indent: 20 });
  });
  doc.moveDown(0.3);
}

// Helper function to add text
function addText(text, fontSize = 11, isBold = false) {
  doc.fontSize(fontSize);
  if (isBold) {
    doc.font('Helvetica-Bold');
  } else {
    doc.font('Helvetica');
  }
  doc.text(text);
  doc.moveDown(0.3);
}

// Title Page
doc.fontSize(24);
doc.font('Helvetica-Bold');
doc.fillColor('#1a1a1a');
doc.text('SMS Message Examples', { align: 'center' });
doc.moveDown(0.5);

doc.fontSize(18);
doc.font('Helvetica');
doc.fillColor('#333333');
doc.text('ELKABLY E-Learning Platform', { align: 'center' });
doc.moveDown(1);

doc.fontSize(12);
doc.text('All SMS messages are optimized to be between 100-160 characters (1 SMS) and use vertical format with line breaks for better readability.', {
  align: 'center',
  width: 500
});
doc.moveDown(2);

// Add page number
function addPageNumber() {
  doc.fontSize(10);
  doc.font('Helvetica');
  doc.fillColor('#666666');
  const pageNumber = doc.bufferedPageRange().start + 1;
  doc.text(`Page ${pageNumber}`, 50, doc.page.height - 50, {
    align: 'center',
    width: doc.page.width - 100
  });
}

// 1. Welcome Message (Student)
addSection('1. Welcome Message (Student)', 16, true);
addText('Example with all fields:', 12, true);
addCodeBlock(`Welcome to ELKABLY!
Dear Deif Mohamed
Code: 198258
School: Cairo International
Grade: 10
Your learning journey starts now!
Access courses & start learning!
ELKABLY`, 10);
addText('Character Count: ~155 characters', 10, false);
doc.moveDown(0.5);

addText('Without optional fields:', 12, true);
addCodeBlock(`Welcome to ELKABLY!
Dear Deif Mohamed
Code: 198258
Your learning journey starts now!
Access courses & start learning!
ELKABLY`, 10);
addText('Character Count: ~130 characters', 10, false);

// 2. Welcome Message (Parent)
doc.addPage();
addPageNumber();
addSection('2. Welcome Message (Parent)', 16, true);
addText('Example with all fields:', 12, true);
addCodeBlock(`Welcome to ELKABLY!
Student: Deif Mohamed
Code: 198258
School: Cairo International
Grade: 10
Learning journey starts now!
Access courses & start learning!
ELKABLY`, 10);
addText('Character Count: ~150 characters', 10, false);
doc.moveDown(0.5);

addText('Without optional fields:', 12, true);
addCodeBlock(`Welcome to ELKABLY!
Student: Deif Mohamed
Code: 198258
Learning journey starts now!
Access courses & start learning!
ELKABLY`, 10);
addText('Character Count: ~125 characters', 10, false);

// 3. Quiz Completion Notification
doc.addPage();
addPageNumber();
addSection('3. Quiz Completion Notification', 16, true);

addText('Score 90% or above (Excellent):', 12, true);
addCodeBlock(`Quiz Update
Deif Mohamed completed:
"Mathematics Chapter 5 Quiz"
Score: 18/20 (90%)
Outstanding! Keep it up!
ELKABLY`, 10);
addText('Character Count: ~130 characters', 10, false);
doc.moveDown(0.5);

addText('Score 70-89% (Good):', 12, true);
addCodeBlock(`Quiz Update
Deif Mohamed completed:
"Mathematics Chapter 5 Quiz"
Score: 15/20 (75%)
Good job! Great progress!
ELKABLY`, 10);
addText('Character Count: ~128 characters', 10, false);
doc.moveDown(0.5);

addText('Score 50-69% (Average):', 12, true);
addCodeBlock(`Quiz Update
Deif Mohamed completed:
"Mathematics Chapter 5 Quiz"
Score: 12/20 (60%)
Keep encouraging them!
ELKABLY`, 10);
addText('Character Count: ~120 characters', 10, false);
doc.moveDown(0.5);

addText('Score below 50% (Needs Improvement):', 12, true);
addCodeBlock(`Quiz Update
Deif Mohamed completed:
"Mathematics Chapter 5 Quiz"
Score: 8/20 (40%)
More practice needed.
Please support!
ELKABLY`, 10);
addText('Character Count: ~125 characters', 10, false);

// 4. Content Completion Notification
doc.addPage();
addPageNumber();
addSection('4. Content Completion Notification', 16, true);
addText('Example:', 12, true);
addCodeBlock(`Progress Update
Deif Mohamed completed:
"Introduction to Algebra"
In: Week 3: Mathematics
Excellent progress!
ELKABLY`, 10);
addText('Character Count: ~115 characters', 10, false);

// 5. Topic Completion Notification
doc.addPage();
addPageNumber();
addSection('5. Topic Completion Notification', 16, true);
addText('Example:', 12, true);
addCodeBlock(`Progress Update
Deif Mohamed completed:
"Quadratic Equations"
In: Week 4: Advanced Math
Excellent work!
Keep encouraging!
ELKABLY`, 10);
addText('Character Count: ~120 characters', 10, false);

// 6. Course/Week Completion Notification
doc.addPage();
addPageNumber();
addSection('6. Course/Week Completion Notification', 16, true);
addText('Example:', 12, true);
addCodeBlock(`Congratulations!
Deif Mohamed completed:
Week 5: Mathematics Advanced
Excellent work!
We are proud!
ELKABLY`, 10);
addText('Character Count: ~105 characters', 10, false);

// 7. Purchase/Payment Confirmation
doc.addPage();
addPageNumber();
addSection('7. Purchase/Payment Confirmation', 16, true);
addText('Example:', 12, true);
addCodeBlock(`Payment Confirmed!
Student: Deif Mohamed
Order: #ORD-2024-001234
Items: 3 item(s)
Total: EGP 1500
Thank you!
ELKABLY`, 10);
addText('Character Count: ~110 characters', 10, false);
doc.moveDown(0.5);

addText('With single item:', 12, true);
addCodeBlock(`Payment Confirmed!
Student: Deif Mohamed
Order: #ORD-2024-001234
Items: 1 item(s)
Total: EGP 500
Thank you!
ELKABLY`, 10);
addText('Character Count: ~109 characters', 10, false);

// 8. Course Enrollment Notification
doc.addPage();
addPageNumber();
addSection('8. Course Enrollment Notification', 16, true);
addText('Example with subject:', 12, true);
addCodeBlock(`Enrollment Confirmed!
Student: Deif Mohamed
Course: Week 6: Advanced Calculus
Subject: Mathematics
Ready to learn!
Access materials now!
ELKABLY`, 10);
addText('Character Count: ~130 characters', 10, false);
doc.moveDown(0.5);

addText('Example without subject:', 12, true);
addCodeBlock(`Enrollment Confirmed!
Student: Deif Mohamed
Course: Week 6: Advanced Calculus
Ready to learn!
Access materials now!
ELKABLY`, 10);
addText('Character Count: ~115 characters', 10, false);

// 9. Bundle Enrollment Notification
doc.addPage();
addPageNumber();
addSection('9. Bundle Enrollment Notification', 16, true);
addText('Example with subject:', 12, true);
addCodeBlock(`Enrollment Confirmed!
Student: Deif Mohamed
Course: Complete Mathematics Course
Subject: Mathematics
Weeks: 12 included
Access all materials!
ELKABLY`, 10);
addText('Character Count: ~135 characters', 10, false);
doc.moveDown(0.5);

addText('Example without subject:', 12, true);
addCodeBlock(`Enrollment Confirmed!
Student: Deif Mohamed
Course: Complete Mathematics Course
Weeks: 12 included
Access all materials!
ELKABLY`, 10);
addText('Character Count: ~120 characters', 10, false);

// Message Characteristics
doc.addPage();
addPageNumber();
addSection('Message Characteristics', 16, true);
doc.font('Helvetica');
doc.fontSize(11);
doc.fillColor('#000000');

const characteristics = [
  'Length: All messages are between 100-160 characters (including newlines)',
  'Format: Vertical format with line breaks for better readability',
  'Structure: Organized with clear sections separated by line breaks',
  'Personalization: Includes student name, codes, and relevant details',
  'Action-oriented: Encourages engagement and provides clear next steps',
  'Branding: Ends with "ELKABLY" for brand recognition',
  'Truncation: Automatically truncated if exceeds 160 characters',
  'Readability: Vertical format makes messages easier to scan and read on mobile devices'
];

characteristics.forEach(char => {
  doc.text(`• ${char}`, { indent: 20 });
  doc.moveDown(0.3);
});

// Notes
doc.addPage();
addPageNumber();
addSection('Notes', 16, true);
doc.font('Helvetica');
doc.fontSize(11);
doc.fillColor('#000000');

const notes = [
  'All messages are automatically truncated to 160 characters maximum',
  'Optional fields (school name, grade, subject) are included when available',
  'Messages are optimized for Egyptian phone numbers (SMS delivery)',
  'Non-Egyptian numbers receive WhatsApp messages instead'
];

notes.forEach(note => {
  doc.text(`• ${note}`, { indent: 20 });
  doc.moveDown(0.3);
});

// Finalize the PDF
doc.end();

console.log(`✅ PDF generated successfully: ${outputPath}`);

