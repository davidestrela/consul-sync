# consul-sync

Simple tool to sync consul KV store to local disk or localdisk to consul.

## How to use

### Step 1
Install all project dependencies with `npm i`

### Step 2
Rename `.env.example` to `.env` and set the consul api url

### Step 3
Run `npm run sync-local` to copy all consul content tou you disk

### Step 4
Do all the changes on your machine


### Step 5
Run `npm run sync-remote` to apply all the changes on consul, thsi command will prompt all the changes and ask for confirmation. 
