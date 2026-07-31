/** Custom error classes with HTTP status codes. */
export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class BadRequest extends AppError {
  constructor(m: string) { super(400, m); }
}

export class Unauthorized extends AppError {
  constructor(m: string) { super(401, m); }
}

export class Forbidden extends AppError {
  constructor(m: string) { super(403, m); }
}

export class NotFound extends AppError {
  constructor(m: string) { super(404, m); }
}

export class Conflict extends AppError {
  constructor(m: string) { super(409, m); }
}
