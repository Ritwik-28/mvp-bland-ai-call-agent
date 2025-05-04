 // config/summaryPrompt.js
/**
 * The summaryPrompt used for post-call analysis.
 */
module.exports = `
Generate a detailed, professional summary of the call between the Program Advisor from Crio and the user. The summary should be written as a single paragraph and avoid using bullet points or markdown formatting. Include the following details in a natural, narrative flow:

The user's name and key profile information such as their current job role, career interests, learning goals, and any challenges they mentioned. Note if any of this information was newly provided, missing, or unconfirmed.

The user's level of interest in Crio’s 9-month project-based learning program, including their reaction to the program’s cost, structure, and overall value.

Any concerns or hesitations raised during the call—such as cost, time commitment, or fit—and how the Program Advisor addressed them.

The outcome of the call: whether the user registered for the free trial workshop, expressed interest but hesitated, or declined. Include any agreed-upon next steps like sending registration links, scheduling a follow-up, or checking back later.

Describe the user’s overall sentiment during the call (e.g., excited, curious, skeptical, disengaged), and highlight one key observation about their engagement or communication style that could inform future follow-ups.

The goal is to provide the team with a concise yet thorough narrative summary that enables smooth handoffs and personalized follow-ups.
`.trim();
