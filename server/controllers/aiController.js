
import { openai } from "../configs/openai.js";

export const generateCarDetails = async (req, res) => {
    try {
        if (req.user?.role !== "owner") {
            return res.status(403).json({
                success: false,
                message: "Only owners can generate car details"
            });
        }

        const { base64Image, mimeType } = req.body;

        if (!base64Image || !mimeType) {
            return res.status(400).json({
                success: false,
                message: "Image is required"
            });
        }

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(mimeType)) {
            return res.status(400).json({
                success: false,
                message: "Unsupported image format"
            });
        }

        const imageSize = Buffer.byteLength(
            base64Image, "base64"
        );

        if (imageSize > 5 * 1024 * 1024) {
            return res.status(413).json({
                success: false,
                message: "Image must be smaller than 5MB"
            });
        }

        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            messages: [
                {
                    role: "system",
                    content: `
                        You are an AI car listing assistant for a
                        car rental platform.

                        Analyze the uploaded car image and return
                        structured information about the vehicle.

                        Respond ONLY with valid raw JSON.
                        No markdown or explanations.

                        Use this exact schema:

                        {
                        "brand": string | null,
                        "model": string | null,
                        "year": number | null,
                        "category": string | null,
                        "transmission": string | null,
                        "fuel_type": string | null,
                        "seating_capacity": number | null,
                        "description": string
                        }

                        Rules:

                        1. Identify the car manufacturer and likely model.
                        2. Never invent specifications that cannot be
                        reasonably established from the image.
                        3. If the exact year is uncertain, return null.
                        4. Category must be one of:
                        "Sedan", "SUV", "Hatchback", "Coupe",
                        "Convertible", "Wagon", "Van".
                        5. Transmission must be "Automatic" or "Manual",
                        or null if uncertain.
                        6. Fuel type must be "Petrol", "Diesel",
                        "Electric", or "Hybrid", or null.
                        7. Seating capacity must be a number or null.
                        8. Write a professional, attractive rental
                        description of approximately 60-100 words.
                        9. Avoid claiming unverified features.
                        10. Do not generate price or location.
                        11. If the image does not show a car,
                            return null for all fields and an
                            empty description.
                        `
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Analyze this car image and generate listing details."
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`
                            }
                        }
                    ]
                }
            ]
        });

        const raw = response.choices[0]?.message?.content;

        if (!raw) {
            throw new Error("AI returned an empty response");
        }

        const cleaned = raw
            .replace(/```json|```/g, "")
            .trim();

        let carDetails;

        try {
            carDetails = JSON.parse(cleaned);
        } catch {
            throw new Error("AI did not return valid JSON");
        }

        if (!carDetails || typeof carDetails !== "object" ||
            Array.isArray(carDetails)) {
            throw new Error("Invalid AI response");
        }

        const stringFields = [
            "brand", "model", "category",
            "transmission", "fuel_type", "description"
        ];

        for (const field of stringFields) {
            if (carDetails[field] != null &&
                typeof carDetails[field] !== "string") {
                carDetails[field] = null;
            }
        }

        for (const field of ["year", "seating_capacity"]) {
            if (carDetails[field] != null &&
                (!Number.isInteger(carDetails[field]) ||
                 carDetails[field] <= 0)) {
                carDetails[field] = null;
            }
        }

        if (!carDetails.brand && !carDetails.model) {
            return res.status(422).json({
                success: false,
                message: "Could not identify a car in this image"
            });
        }

        return res.json({
            success: true,
            carDetails
        });

    } catch (error) {
        console.error("AI Car Generation Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to generate car details"
        });
    }
};
