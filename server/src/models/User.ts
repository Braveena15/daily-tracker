import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select: false means normal queries never load the hash; login asks for it explicitly.
    passwordHash: { type: String, required: true, select: false },
    heightCm: { type: Number, min: 50, max: 300 },
    birthYear: { type: Number, min: 1900, max: 2100 },
    sex: { type: String, enum: ["male", "female"] },
    goalWeightKg: { type: Number, min: 20, max: 500 },
  },
  {
    timestamps: true,
    toJSON: {
      // Shape of a user whenever it is sent as JSON: never includes the password hash.
      transform: (_doc, ret: Record<string, unknown>) => {
        const { _id, __v, passwordHash, ...rest } = ret;
        return { id: String(_id), ...rest };
      },
    },
  },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel = model("User", userSchema);
