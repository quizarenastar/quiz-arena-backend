const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            minlength: [1, 'Name must be at least 1 character long'],
            maxlength: [50, 'Name cannot exceed 50 characters'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            trim: true,
            lowercase: true,
            match: [
                /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                'Please enter a valid email address',
            ],
        },
        subject: {
            type: String,
            required: [true, 'Subject is required'],
            trim: true,
            minlength: [2, 'Subject must be at least 2 characters long'],
            maxlength: [100, 'Subject cannot exceed 100 characters'],
        },
        message: {
            type: String,
            required: [true, 'Message is required'],
            trim: true,
            minlength: [10, 'Message must be at least 10 characters long'],
            maxlength: [1000, 'Message cannot exceed 1000 characters'],
        },
        status: {
            type: String,
            enum: ['pending', 'in-progress', 'resolved'],
            default: 'pending',
        },
    },
    {
        timestamps: true,
    }
);

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;
