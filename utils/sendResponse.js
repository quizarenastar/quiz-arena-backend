exports.sendSuccess = (res, data = {}, message = 'Success', status = 200) => {
    return res.status(status).json({
        success: true,
        message,
        data,
    });
};

exports.sendError = (res, error = 'Error', status = 400) => {
    return res.status(status).json({
        success: false,
        message: error,
    });
};
