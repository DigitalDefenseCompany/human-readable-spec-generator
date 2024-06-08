import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import OpenAI from 'openai';
import path from 'path';

/**
 * Filter files to include only .ts, .js, and .md files.
 */
function filterFiles(files: string[]): string[] {
  return files.filter(file => {
    const ext = path.extname(file);
    return ['.ts', '.js', '.md'].includes(ext);
  });
}

/**
 * Summarize the contents of the repository.
 */
async function summarizeRepoContents(): Promise<string> {
  const files = filterFiles(fs.readdirSync('./'));
  let content = '';

  core.info('Filtering and reading files for summary...');
  files.forEach(file => {
    if (fs.lstatSync(file).isFile()) {
      content += fs.readFileSync(file, 'utf-8') + '\n';
      core.debug(`Reading file: ${file}`);
    }
  });

  core.info('Generating summary using OpenAI API...');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const completion = await openai.chat.completions.create({
    messages: [{ role: "system", content: "Summarize the following repository content: " + content }],
    model: "gpt-3.5-turbo"
  });

  const messageContent = completion.choices[0].message?.content;
  if (!messageContent) {
    throw new Error('Failed to generate summary');
  }

  return messageContent;
}

/**
 * Create or update an issue with the summary.
 */
async function createOrUpdateIssue(summary: string) {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN is not defined');
  }

  const octokit = github.getOctokit(githubToken);
  const { owner, repo } = github.context.repo;
  
  const issueTitle = 'Repository Summary';
  core.info('Fetching existing issues...');
  const issues = await octokit.rest.issues.listForRepo({ owner, repo });
  const existingIssue = issues.data.find(issue => issue.title === issueTitle);

  if (existingIssue) {
    core.info(`Adding comment to existing issue #${existingIssue.number}...`);
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: existingIssue.number,
      body: summary
    });
  } else {
    core.info('Creating a new issue...');
    await octokit.rest.issues.create({
      owner,
      repo,
      title: issueTitle,
      body: summary
    });
  }
}

export async function run(): Promise<void> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not defined');
    }

    core.info('Starting repository summarization...');
    const summary = await summarizeRepoContents();
    await createOrUpdateIssue(summary);
    core.setOutput('summary', summary);
    core.info('Repository summarization completed successfully.');
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
