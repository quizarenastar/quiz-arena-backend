const Contact = require('../../models/Contact');
const { sendSuccess, sendError } = require('../../utils/sendResponse');

const contactController = {
    // Create a new contact message
    createContact: async (req, res) => {
        try {
            const {
                name,
                email,
                subject,
                message,
                category,
                pageUrl,
                contactNumber,
            } = req.body;

            const contact = new Contact({
                name,
                email,
                subject,
                message,
                category,
                pageUrl,
                contactNumber,
            });

            await contact.save();

            sendSuccess(res, 'Message sent successfully', 201);
        } catch (error) {
            console.error('Contact save error:', error);
            sendError(res, `Error sending message: ${error.message}`, 500);
        }
    },
};

module.exports = contactController;
