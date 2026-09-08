# Coding Style

## Comments

- Keep comments short and summarized.
- Add comments only when they provide meaningful context.
- Avoid obvious or redundant comments.
- Prefer no comment over a low-value comment.

## Formatting

- Do not use em dashes.
- Use regular hyphens or rephrase the sentence.

## General

- Prefer clean, readable code over heavy documentation.
- Keep functions and logic self-explanatory when possible.

## Commit Messages

- Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) for all future commits.
- Format: `<type>[optional scope][optional !]: <description>`.
- Use `feat` for new features and `fix` for bug fixes. Use appropriate types such as `docs`, `test`, `refactor`, `build`, `ci`, or `chore` for other changes.
- Use consistent lowercase types and concise descriptions. Add a scope when it clarifies the affected area.
- Mark breaking changes with `!` before the colon or an uppercase `BREAKING CHANGE:` footer explaining the change.
- Separate optional bodies and footers with blank lines.
- Prefer separate commits for unrelated changes.
