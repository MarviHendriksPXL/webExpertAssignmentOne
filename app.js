const express = require('express');
const fs = require('fs');
const yargs = require('yargs');

const app = express(); // Create an Express app
const dataFile = 'data.json';
let configData;

const argv = yargs
    .option('config', {
        alias: 'c',
        describe: 'Configuratiebestand',
        default: 'data.json',
    })
    .argv;

function readConfigData(req, res, next) {
    const configFile = String(argv.config) || dataFile;

    fs.readFile(configFile, { encoding: 'utf8' }, (err, data) => {
        if (err) {
            return next(new Error('Error reading data from the file'));
        }

        try {
            configData = JSON.parse(data);
            req.configData = JSON.parse(data);
            next();
        } catch (parseError) {
            return next(new Error('Error parsing configuration data'));
        }
    });
}

// Handle SIGINT
process.on('SIGINT', () => {
    if (configData) {
        const configFile = String(argv.config) || dataFile;
        fs.writeFile(configFile, JSON.stringify(configData, null, 2), (writeErr) => {
            if (writeErr) {
                console.error('Error writing data to the file:', writeErr);
                process.exit(1);
            }

            console.log('Configuration data saved successfully');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

app.get('/person', readConfigData, express.json(), (req, res) => {
    const { _embed, name, age_gte, age_lte } = req.query;

    const routeConfig = configData.find((item) => item.route === 'person');
    const persons = routeConfig.data;

    if (_embed === 'pet') {
        // map creeren met gegevens van pets
        const petMap = new Map();
        const pets = configData.find((item) => item.route === 'pet').data;
        for (const pet of pets) {
            petMap.set(pet.id, pet);
        }

        // de pet data bij persons zetten
        let filteredData = persons.map((person) => ({
            ...person,
            pets: person.petIds.map((petId) => petMap.get(petId)),
        }));
        res.json(filteredData);
    } else {
        // als _embed geen pet is return het normale
        let filteredData = persons;

        if (name) {
            filteredData = filteredData.filter(
                (person) => person.name.toLowerCase() === name.toLowerCase()
            );
        }

        if (age_gte) {
            filteredData = filteredData.filter(
                (person) => person.age >= parseInt(age_gte)
            );
        }

        if (age_lte) {
            filteredData = filteredData.filter(
                (person) => person.age <= parseInt(age_lte)
            );
        }

        if (filteredData.length === 0) {
            return res.status(404).json({ message: 'No matching results found' });
        }

        res.json(filteredData);
    }
});


app.get('/:route/:id', readConfigData, (req, res) => {
    const { route, id } = req.params;
    const { _embed } = req.query;
    const routeConfig = configData.find((item) => item.route === route);

    if (!routeConfig) {
        return res.status(404).json({ message: 'Route not found' });
    }

    const item = routeConfig.data.find((dataItem) => dataItem.id === parseInt(id));

    if (!item) {
        return res.status(404).json({ message: 'Item not found' });
    }

    if (_embed) {
        if (_embed === 'pet') {
            // petdata toevoegen
            const petData = item.petIds.map((petId) => {
                return configData.find((item) => item.route === 'pet').data.find((petItem) => petItem.id === petId);
            });

            // toevoegen aan response
            return res.json({
                ...item,
                pets: petData,
            });
        }
    }
   return res.json(item);
});

app.post('/:route', readConfigData, express.json(), (req, res) => {
    const { route } = req.params;
    const requestData = req.body;
    const routeConfig = configData.find((item) => item.route === route);

    if (!routeConfig) {
        return res.status(404).json({ message: 'Route not found' });
    }

    const requiredProperties = routeConfig.properties;

    for (const property of requiredProperties) {
        if (!(property in requestData)) {
            return res.status(400).json({ message: `Missing property: '${property}' in request body` });
        }
    }

    const existingIds = routeConfig.data.map((item) => item.id);
    const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

    const newItem = {
        id: newId,
        ...requestData,
    };

    routeConfig.data.push(newItem);

    const configFile = String(argv.config) || dataFile;
    fs.writeFile(configFile, JSON.stringify(configData, null, 2), (writeErr) => {
        if (writeErr) {
            console.error('Error writing data to the file:', writeErr);
            res.status(500).json({ message: 'Internal server error' });
            return;
        }

        res.status(201).json(newItem);
    });
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
