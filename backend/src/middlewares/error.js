const mongoose = require('mongoose');
const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

// Known Prisma/database errors become clear client errors instead of 500s
const convertPrismaError = (err) => {
  const message = String(err.message || '');
  if (err.code === 'P2003' || /foreign key constraint/i.test(message)) {
    return new ApiError(
      httpStatus.BAD_REQUEST,
      'This record is used by other records (stock, sales, purchases, transfers…) and cannot be deleted. Deactivate it instead.',
      true,
      err.stack,
    );
  }
  if (/check constraint .*(store_stocks|shop_stocks)/i.test(message)) {
    return new ApiError(
      httpStatus.BAD_REQUEST,
      'Insufficient stock: stock cannot go below zero',
      true,
      err.stack,
    );
  }
  if (err.code === 'P2002') {
    const target = [].concat(err.meta?.target || []).join(', ');
    return new ApiError(
      httpStatus.CONFLICT,
      `Duplicate value${target ? ` for ${target}` : ''}`,
      true,
      err.stack,
    );
  }
  if (err.code === 'P2025') {
    return new ApiError(
      httpStatus.NOT_FOUND,
      'Record not found',
      true,
      err.stack,
    );
  }
  return null;
};

const errorConverter = (err, req, res, next) => {
  let error = err;
  if (!(error instanceof ApiError)) {
    const prismaError = convertPrismaError(error);
    if (prismaError) {
      next(prismaError);
      return;
    }
    const statusCode =
      error.statusCode || error instanceof mongoose.Error
        ? httpStatus.BAD_REQUEST
        : httpStatus.INTERNAL_SERVER_ERROR;
    const message = error.message || httpStatus[statusCode];
    error = new ApiError(statusCode, message, false, error.stack);
  }
  next(error);
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;
  if (config.env === 'production' && !err.isOperational) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = httpStatus[statusCode];
  }
  const response = {
    error: true,
    code: statusCode,
    message,
    ...(config.env === 'development' && { stack: err.stack }),
  };
  res.locals.errorMessage = message;
  if (config.env === 'development') {
    logger.error(err);
  }
  res.status(statusCode).send(response);
};

module.exports = {
  errorHandler,
  errorConverter,
};
