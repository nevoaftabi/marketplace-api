# Marketplace API with Express and JWT

This is a backend for a marketplace app. Users can sign up, log in, post tasks, and claim tasks.

Users can claim multiple tasks, but only one user is allowed to claim a task at a time.

Features
* Input validation - responds with 400 if the data received is not valid 
* Pagination for the /tasks route - you can specify which page and how many results you want
* Handles malformed JSON
* Securely stores passwords in the database (hash + salt)

Technologies used
* Express - for the API
* Node.js
* TypeScript
* PostgreSQL - database
