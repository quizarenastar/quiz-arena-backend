const Contact = require('../../models/Contact');
const { sendError, sendSuccess } = require('../../utils/sendResponse');

const contactController = {
    // Get all contact messages (for admin)
    getAllContacts: async (req, res) => {
        try {
            const contacts = await Contact.find()
                .sort({ createdAt: -1 })
                .select('-__v');

            sendSuccess(
                res,
                contacts,
                'Contact messages retrieved successfully',
                200
            );
        } catch (error) {
            sendError(res, 'Error retrieving messages', 500);
        }
    },

    // Update contact status (for admin)
    updateContactStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            const contact = await Contact.findByIdAndUpdate(
                id,
                { status },
                { new: true, runValidators: true }
            );

            if (!contact) {
                sendError(res, 'Contact message not found', 404);
                return;
            }

            sendSuccess(
                res,
                contact,
                'Contact status updated successfully',
                200
            );
        } catch (error) {
            sendError(res, 'Error updating contact status', 500);
        }
    },
};

module.exports = contactController;
