const Joi = require('joi');
export const deleteQuizSchema = Joi.object({
    reason: Joi.string().min(10).max(500).required(),
});

export const cancelQuizSchema = Joi.object({
    reason: Joi.string().min(10).max(500).required(),
});
