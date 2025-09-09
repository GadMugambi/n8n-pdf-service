// src/utils/validation.ts

import Joi from 'joi';
import { TruncationRequest, ImageConversionRequest } from '../types';
import { ValidationError } from './errors'; // Import your custom error

export const truncationRequestSchema = Joi.object({
  pages: Joi.array()
    .items(Joi.number().integer().min(1))
    .min(1),
  pageRange: Joi.object({
    start: Joi.number().integer().min(1).required(),
    end: Joi.number().integer().min(Joi.ref('start'))
  })
}).xor('pages', 'pageRange');

export const imageConversionRequestSchema = Joi.object({
  pages: Joi.array()
    .items(Joi.number().integer().min(1))
    .min(1),
  pageRange: Joi.object({
    start: Joi.number().integer().min(1).required(),
    end: Joi.number().integer().min(Joi.ref('start'))
  }),
  format: Joi.string().valid('png', 'jpeg', 'tiff').default('png'),
  scale: Joi.number().min(0.1).max(10).default(1)
}).xor('pages', 'pageRange');

export const validateTruncationRequest = (data: any): TruncationRequest => {
  // FIX: Removed .options({ presence: 'required' }) which conflicted with .xor()
  const { error, value } = truncationRequestSchema
    .validate(data);

  if (error) {
    // Throw your custom validation error for consistent error handling
    throw new ValidationError(error.details[0].message);
  }
  return value;
};

export const validateImageConversionRequest = (data: any): ImageConversionRequest => {
  const { error, value } = imageConversionRequestSchema
    .options({ presence: 'optional' })
    .validate(data);

  if (error) {
    throw new ValidationError(error.details[0].message);
  }
  return value;
};