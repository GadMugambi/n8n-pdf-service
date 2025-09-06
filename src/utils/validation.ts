import Joi from 'joi';
import { TruncationRequest } from '../types';

export const truncationRequestSchema = Joi.object({
  pages: Joi.array()
    .items(Joi.number().integer().min(1))
    .min(1)
    .when('pageRange', {
      is: Joi.exist(),
      then: Joi.forbidden(),
      otherwise: Joi.required()
    }),
  pageRange: Joi.object({
    start: Joi.number().integer().min(1).required(),
    end: Joi.number().integer().min(Joi.ref('start'))
  }).when('pages', {
    is: Joi.exist(),
    then: Joi.forbidden(),
    otherwise: Joi.required()
  })
}).xor('pages', 'pageRange');

export const validateTruncationRequest = (data: any): TruncationRequest => {
  const { error, value } = truncationRequestSchema.validate(data);
  if (error) {
    throw new Error(`Validation error: ${error.details[0].message}`);
  }
  return value;
};