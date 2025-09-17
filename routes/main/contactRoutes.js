const express = require('express');
const router = express.Router();
const contactController = require('../../controllers/main/contactController');
const { validate } = require('../../middlewares/validate');
const { contactSchema } = require('../../validation/contactUsValidation');

// Public route - Create a new contact message
router.post('/', validate(contactSchema), contactController.createContact);

module.exports = router;
