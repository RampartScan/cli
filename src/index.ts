#!/usr/bin/env node

import { Command } from 'commander';
import { scanCommand } from './commands/scan';
import { authCommand } from './commands/auth';
import { creditsCommand } from './commands/credits';
import { scansCommand } from './commands/scans';
import pkg from '../package.json';

const program = new Command();

program
  .name('rampart')
  .description('Rampart Security CLI — scan websites for vulnerabilities')
  .version(pkg.version);

program.addCommand(scanCommand);
program.addCommand(authCommand);
program.addCommand(creditsCommand);
program.addCommand(scansCommand);

program.parse();
