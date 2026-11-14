/**
 * The bodies the client sends to the routes that check them with zod, each
 * typed against that route's schema (roadmap D1 phase 2). Each builds exactly
 * what its caller sent inline before, key order included.
 */
// @ts-check
import { toCmFromFeetInches, toKg } from "./units";

/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").SignupBody} SignupBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").LoginBody} LoginBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").PasswordChangeBody} PasswordChangeBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").AccountDeleteBody} AccountDeleteBody */

/** @typedef {{ email: string, password: string }} AuthForm */

/**
 * The sign-up body: the auth form, and the profile in centimetres and
 * kilograms, converted from the form's units. The rest of the profile form
 * travels as it is.
 * @param {{ authForm: AuthForm, profileForm: Record<string, string>, heightUnit: string, weightUnit: string }} parts
 * @returns {SignupBody}
 */
export const signupBody = ({ authForm, profileForm, heightUnit, weightUnit }) => ({
  ...authForm,
  profile: {
    ...profileForm,
    heightCm:
      heightUnit === "ft"
        ? toCmFromFeetInches(profileForm.heightFeet, profileForm.heightInches)
        : profileForm.heightCm,
    weightKg:
      weightUnit === "lb"
        ? toKg(profileForm.weight, "lb")
        : profileForm.weight || profileForm.weightKg
  }
});

/**
 * The sign-in body: the auth form, and whether to keep the session.
 * @param {AuthForm} authForm
 * @param {boolean} rememberMe
 * @returns {LoginBody}
 */
export const loginBody = (authForm, rememberMe) => ({ ...authForm, rememberMe });

/**
 * The password change body.
 * @param {{ currentPassword: string, newPassword: string }} passwords
 * @returns {PasswordChangeBody}
 */
export const passwordChangeBody = ({ currentPassword, newPassword }) => ({
  currentPassword,
  newPassword
});

/**
 * The account delete body: the password that confirms it.
 * @param {string} password
 * @returns {AccountDeleteBody}
 */
export const accountDeleteBody = (password) => ({ password });
