#!/usr/bin/env node

import { Command } from 'commander';
import { scanCommand } from './commands/scan';
import { authCommand } from './commands/auth';
import { creditsCommand } from './commands/credits';
import { scansCommand } from './commands/scans';

const program = new Command();

program
  .name('rampart')
  .description('Rampart Security CLI — scan websites for vulnerabilities')
  .version('0.1.0');

program.addCommand(scanCommand);
program.addCommand(authCommand);
program.addCommand(creditsCommand);
program.addCommand(scansCommand);

program.parse();
