// Global Error Handlers for Stability
process.on('uncaughtException', (err) => {
    console.log('🔴 [CRITICAL ERROR - UNCAUGHT]:', err.message);
    console.log(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.log('🔴 [CRITICAL ERROR - UNHANDLED REJECTION]:', reason);
});

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const os = require('os');
const { exec } = require('child_process');

const app = express();
const PORT = 3100;
const KNOWLEDGE_PATH = path.join(__dirname, 'knowledge');
