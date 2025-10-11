const Question = require('../models/Question');
const OpenAI = require('openai');

class AIService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async generateQuizQuestions(
        topic,
        numQuestions,
        difficulty = 'medium',
        category = null
    ) {
        try {
            // Infer category from topic if not provided
            const inferredCategory =
                category || this.inferCategoryFromTopic(topic);

            const prompt = this.createQuizGenerationPrompt(
                topic,
                numQuestions,
                difficulty,
                inferredCategory
            );

            const completion = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are an expert quiz creator. Generate high-quality educational questions in valid JSON format.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                max_tokens: 3000,
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error('No content generated');

            const questions = this.parseQuestionsResponse(content);

            const formattedQuestions = this.validateAndFormatQuestions(
                questions,
                topic,
                difficulty
            );

            // Return both questions and the inferred category
            return {
                questions: formattedQuestions,
                suggestedCategory: inferredCategory,
            };
        } catch (error) {
            console.error('AI Quiz Generation Error:', error);
            throw new Error('Failed to generate quiz questions with AI');
        }
    }

    inferCategoryFromTopic(topic) {
        const topicLower = topic.toLowerCase();

        const categoryKeywords = {
            programming: [
                'code',
                'programming',
                'javascript',
                'python',
                'java',
                'react',
                'node',
                'web development',
                'software',
                'algorithm',
                'data structure',
            ],
            technology: [
                'tech',
                'technology',
                'computer',
                'software',
                'hardware',
                'ai',
                'machine learning',
                'cloud',
                'cyber',
            ],
            mathematics: [
                'math',
                'algebra',
                'geometry',
                'calculus',
                'statistics',
                'numbers',
                'equations',
            ],
            science: [
                'science',
                'physics',
                'chemistry',
                'biology',
                'astronomy',
                'scientific',
            ],
            history: [
                'history',
                'historical',
                'ancient',
                'medieval',
                'war',
                'civilization',
            ],
            geography: [
                'geography',
                'countries',
                'cities',
                'continents',
                'maps',
                'capitals',
                'location',
            ],
            sports: [
                'sports',
                'football',
                'basketball',
                'cricket',
                'olympics',
                'athletics',
            ],
            entertainment: [
                'entertainment',
                'movies',
                'music',
                'celebrity',
                'cinema',
                'films',
            ],
            literature: [
                'literature',
                'books',
                'authors',
                'poetry',
                'novels',
                'writing',
            ],
            business: [
                'business',
                'management',
                'marketing',
                'finance',
                'economics',
                'entrepreneurship',
            ],
            language: [
                'language',
                'english',
                'grammar',
                'vocabulary',
                'linguistics',
            ],
        };

        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            if (keywords.some((keyword) => topicLower.includes(keyword))) {
                return category;
            }
        }

        return 'general-knowledge';
    }

    createQuizGenerationPrompt(topic, numQuestions, difficulty, category) {
        return `Generate ${numQuestions} multiple choice questions about ${topic} at ${difficulty} difficulty level.

Category: ${category}

Requirements:
- Each question should have exactly 4 options (A, B, C, D)
- Only one correct answer per question
- Questions should be diverse and educational
- Include brief explanations for correct answers
- Difficulty should be appropriate for ${difficulty} level

Return a JSON array with this exact structure:
[
  {
    "question": "Question text here",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "explanation": "Brief explanation of the correct answer"
  }
]

Topic: ${topic}
Number of questions: ${numQuestions}
Difficulty: ${difficulty}`;
    }

    parseQuestionsResponse(response) {
        try {
            // Clean up the response to extract JSON
            let cleanContent = response.trim();
            if (cleanContent.startsWith('```json')) {
                cleanContent = cleanContent
                    .replace(/```json\n?/, '')
                    .replace(/\n?```$/, '');
            }

            const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error('No valid JSON found in response');
            }

            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.error('Error parsing AI response:', error);
            throw new Error('Failed to parse AI-generated questions');
        }
    }

    validateAndFormatQuestions(questions, topic, difficulty) {
        return questions.map((q, index) => {
            if (
                !q.question ||
                !Array.isArray(q.options) ||
                q.options.length !== 4
            ) {
                throw new Error(`Invalid question format at index ${index}`);
            }

            if (
                typeof q.correctAnswer !== 'number' ||
                q.correctAnswer < 0 ||
                q.correctAnswer > 3
            ) {
                throw new Error(`Invalid correct answer at index ${index}`);
            }

            return {
                question: q.question.trim(),
                type: 'multiple-choice',
                options: q.options.map((opt) => opt.trim()),
                correctAnswer: q.correctAnswer,
                explanation: q.explanation ? q.explanation.trim() : '',
                topic: topic,
                difficulty: difficulty,
                points: this.getPointsByDifficulty(difficulty),
                timeLimit: this.getTimeLimitByDifficulty(difficulty),
                isAIGenerated: true,
                order: index,
            };
        });
    }

    getPointsByDifficulty(difficulty) {
        const pointsMap = {
            easy: 1,
            medium: 2,
            hard: 3,
        };
        return pointsMap[difficulty] || 2;
    }

    getTimeLimitByDifficulty(difficulty) {
        const timeLimitMap = {
            easy: 30,
            medium: 45,
            hard: 60,
        };
        return timeLimitMap[difficulty] || 45;
    }

    async enhanceQuestion(questionText, topic) {
        try {
            const prompt = `Improve this quiz question about ${topic}:
"${questionText}"

Make it clearer, more engaging, and educationally valuable while maintaining the same difficulty level. Return only the improved question text.`;

            const completion = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.5,
                max_tokens: 200,
            });

            return (
                completion.choices[0].message.content?.trim() || questionText
            );
        } catch (error) {
            console.error('Question enhancement error:', error);
            return questionText; // Return original if enhancement fails
        }
    }

    async generateQuizAnalysis(attempt, questions) {
        const {
            answers,
            score,
            totalQuestions,
            correctAnswers,
            antiCheatViolations,
        } = attempt;

        // Prepare analysis data
        const incorrectQuestions = answers
            .filter((a) => !a.isCorrect)
            .map((a) => {
                const question = questions.find(
                    (q) => q._id.toString() === a.questionId.toString()
                );
                return {
                    question: question?.question,
                    selectedOption: question?.options[a.selectedOption],
                    correctOption: question?.options[question.correctAnswer],
                    explanation: question?.explanation,
                };
            });

        const performanceData = {
            score,
            totalQuestions,
            correctAnswers,
            percentage: (correctAnswers / totalQuestions) * 100,
            avgTimePerQuestion: attempt.duration / totalQuestions / 1000,
            violationsCount: antiCheatViolations.length,
        };

        const prompt = `Analyze this quiz performance and provide detailed feedback:

        Performance Summary:
        - Score: ${score} points
        - Correct Answers: ${correctAnswers}/${totalQuestions} (${performanceData.percentage.toFixed(
            1
        )}%)
        - Average Time per Question: ${performanceData.avgTimePerQuestion.toFixed(
            1
        )} seconds
        - Anti-cheat Violations: ${performanceData.violationsCount}

        Incorrect Questions: ${
            incorrectQuestions.length > 0
                ? JSON.stringify(incorrectQuestions, null, 2)
                : 'None'
        }

        Provide a comprehensive analysis including:
        1. Overall Performance Assessment
        2. Strengths and Weaknesses
        3. Areas for Improvement
        4. Study Recommendations
        5. Time Management Analysis

        Keep the analysis encouraging but honest, and provide actionable advice.
        Format as JSON with these sections: {
            "overallAssessment": "string",
            "strengths": ["array of strings"],
            "weaknesses": ["array of strings"],
            "improvements": ["array of strings"],
            "studyRecommendations": ["array of strings"],
            "timeManagement": "string",
            "encouragement": "string"
        }`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 1500,
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error('No analysis generated');

            // Clean and parse JSON
            let cleanContent = content.trim();
            if (cleanContent.startsWith('```json')) {
                cleanContent = cleanContent
                    .replace(/```json\n?/, '')
                    .replace(/\n?```$/, '');
            }

            return JSON.parse(cleanContent);
        } catch (error) {
            console.error('Analysis generation error:', error);
            // Return default analysis if AI fails
            return this.generateDefaultAnalysis(performanceData);
        }
    }

    generateDefaultAnalysis(performanceData) {
        const { percentage, avgTimePerQuestion, violationsCount } =
            performanceData;

        return {
            overallAssessment: `You scored ${percentage.toFixed(
                1
            )}% on this quiz. ${
                percentage >= 80
                    ? 'Excellent work!'
                    : percentage >= 60
                    ? 'Good effort!'
                    : 'Keep practicing!'
            }`,
            strengths:
                percentage >= 60
                    ? ['Good understanding of the topics']
                    : ['Participation and effort'],
            weaknesses:
                percentage < 60 ? ['Need more practice with the concepts'] : [],
            improvements: [
                'Review incorrect answers',
                'Study the explanations provided',
            ],
            studyRecommendations: [
                'Focus on areas where you made mistakes',
                'Practice similar questions',
            ],
            timeManagement:
                avgTimePerQuestion > 60
                    ? 'Try to answer questions more quickly'
                    : 'Good time management',
            encouragement:
                'Keep learning and practicing! Every attempt helps you improve.',
        };
    }

    createAnalysisPrompt(attempt, questions) {
        const correctAnswers = attempt.correctAnswers;
        const totalQuestions = attempt.totalQuestions;
        const percentage = attempt.percentage;
        const avgTimePerQuestion = attempt.analytics.averageTimePerQuestion;

        // Analyze question topics and performance
        const topicPerformance = this.calculateTopicPerformance(
            attempt,
            questions
        );

        return `Analyze this quiz attempt and provide detailed insights:

Performance Summary:
- Score: ${correctAnswers}/${totalQuestions} (${percentage.toFixed(1)}%)
- Average time per question: ${avgTimePerQuestion.toFixed(1)} seconds
- Total duration: ${attempt.duration} seconds

Topic Performance:
${Object.entries(topicPerformance)
    .map(
        ([topic, data]) =>
            `- ${topic}: ${data.correct}/${data.total} correct (${(
                (data.correct / data.total) *
                100
            ).toFixed(1)}%)`
    )
    .join('\n')}

Provide analysis in this JSON format:
{
  "performanceInsights": "Overall performance analysis (2-3 sentences)",
  "strengthAreas": [{"topic": "topic name", "score": percentage}],
  "weaknessAreas": [{"topic": "topic name", "score": percentage, "suggestions": ["suggestion1", "suggestion2"]}],
  "overallRating": "excellent|good|average|needs-improvement",
  "timeManagement": {
    "rating": "excellent|good|average|poor",
    "feedback": "Time management feedback"
  },
  "recommendedStudyPlan": [
    {
      "topic": "topic name",
      "priority": "high|medium|low",
      "studyTime": minutes,
      "resources": ["resource1", "resource2"]
    }
  ],
  "confidenceAnalysis": {
    "overconfident": boolean,
    "underconfident": boolean,
    "wellCalibrated": boolean,
    "feedback": "Confidence feedback"
  }
}`;
    }

    calculateTopicPerformance(attempt, questions) {
        const topicPerformance = {};

        attempt.answers.forEach((answer) => {
            const question = questions.find(
                (q) => q._id.toString() === answer.questionId.toString()
            );
            if (question) {
                const topic = question.topic || 'General';
                if (!topicPerformance[topic]) {
                    topicPerformance[topic] = { correct: 0, total: 0 };
                }
                topicPerformance[topic].total++;
                if (answer.isCorrect) {
                    topicPerformance[topic].correct++;
                }
            }
        });

        return topicPerformance;
    }

    parseAnalysisResponse(response) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No valid JSON found in analysis response');
            }

            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.error('Error parsing AI analysis:', error);
            return this.generateFallbackAnalysis();
        }
    }

    generateFallbackAnalysis(attempt) {
        const percentage = attempt ? attempt.percentage : 0;

        return {
            performanceInsights:
                'Analysis completed. Review your performance and focus on areas for improvement.',
            strengthAreas: [],
            weaknessAreas: [],
            overallRating:
                percentage >= 80
                    ? 'good'
                    : percentage >= 60
                    ? 'average'
                    : 'needs-improvement',
            timeManagement: {
                rating: 'average',
                feedback:
                    'Continue practicing to improve your time management skills.',
            },
            recommendedStudyPlan: [],
            confidenceAnalysis: {
                overconfident: false,
                underconfident: false,
                wellCalibrated: true,
                feedback:
                    'Keep practicing to build confidence in your knowledge.',
            },
        };
    }
}

module.exports = new AIService();
