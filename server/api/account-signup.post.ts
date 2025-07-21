import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { z } from "zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import HashService from "../services/HashService";
import { log } from "../logger";
import { registerSchema } from "~/schema/zod";
import { postmarkClient } from "../clients/postmarkClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";

export default defineEventHandler(async (event) => {
  try {
    // Read and validate request body
    const body = await readBody(event);
    const { firstName, lastName, email, password } = registerSchema.parse(body);

    // Check if email is already in use
    const existingUser = await PrismaDb.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      setResponseStatus(event, 409);
      return { message: "Email is already in use." };
    }

    // Hash the password
    const hashedPassword = await new HashService().hash(password);

    // Use a transaction to ensure atomicity
    const result = await PrismaDb.$transaction(async (prisma) => {
      // Create new user
      const newUser = await prisma.user.create({
        data: {
          firstName,
          lastName,
          email,
          password: hashedPassword,
          settings: {},
          config: {},
        },
        select: {
          id: true,
        },
      });

      const newAccount = await prisma.account.create({
        data: {
          name: "Default",
          isDefault: true,
        },
        select: {
          id: true,
        },
      });
      const defaultAccountId = newAccount.id;
      const userId = newUser.id;

      const newBudget = await prisma.budget.create({
        data: {
          name: "Default Budget",
          userId: userId,
          accountId: defaultAccountId,
          isDefault: true,
        },
      });

      const defaultBudgetId = newBudget.id;

      await prisma.userAccount.create({
        data: { accountId: defaultAccountId, userId: userId },
      });

      await prisma.accountRegister.create({
        data: {
          name: "Primary Checking",
          balance: 0,
          statementAt: dateTimeService.nowDate(),
          account: {
            connect: { id: defaultAccountId },
          },
          type: {
            connect: { id: 1 },
          },
          budget: {
            connect: { id: defaultBudgetId },
          },
        },
      });

      return newUser;
    });

    log({ message: "New User", data: result, level: "debug" });

    // Send welcome email to the new user
    await postmarkClient.sendEmail({
      From: "Mr. Pepe Dineros <pepe@dineros.cc>",
      To: email,
      Subject: "Welcome to Dineros!",
      HtmlBody: `${firstName},<br>
      <br>
      I am so very excited to see you join Dineros. And I can't wait to help you get started. If you have any questions, simply reply to this email.
      <br>
      Congrats on taking the first step towards financial freedom!
      <br>
      <br>
      Regards,<br>
      &nbsp;&nbsp;Mr. Pepe &amp; The Dineros Team
      `,
    });

    // Send notification email to jeremy@lunarfly.com
    await postmarkClient.sendEmail({
      From: "Mr. Pepe Dineros <pepe@dineros.cc>",
      To: "jeremy@lunarfly.com",
      Subject: "New User Registration on Dineros.cc",
      HtmlBody: `Hi Jeremy,<br>
      <br>
      A new user has signed up on Dineros.cc:<br>
      <br>
      <strong>Name:</strong> ${firstName} ${lastName}<br>
      <strong>Email:</strong> ${email}<br>
      <strong>Registration Date:</strong> ${dateTimeService
        .nowDate()
        .toLocaleString()}<br>
      <br>
      Best regards,<br>
      Dineros Registration System
      `,
    });

    setResponseStatus(event, 201);
    return { message: "User registered successfully." };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
