'use strict';

var http = require('http');
var qs = require('querystring');

/**
 * We're not discovering our devices, we're just hardcoding them.  Easy!
 */
const USER_DEVICES = [
    {
        // This id needs to be unique across all devices discovered for a given manufacturer
        applianceId: 'marantz-sr6010-shield',
        // Company name that produces and sells the smart home device
        manufacturerName: 'Marantz nVidia',
        // Model name of the device
        modelName: 'SR6010 Shield',
        // Version number of the product
        version: '1.0',
        // The name given by the user in your application. Examples include 'Bedroom light' etc
        friendlyName: 'Shield',
        // Should describe the device type and the company/cloud provider.
        // This value will be shown in the Alexa app
        friendlyDescription: 'nVidia Shield via Marantz SR6010',
        // Boolean value to represent the status of the device at time of discovery
        isReachable: true,
        // List the actions the device can support from our API
        // The action should be the name of the actions listed here
        // https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discoverappliancesresponse
        actions: ['turnOn', 'turnOff'],
        // not used at this time
        //additionalApplianceDetails: {
        //    extraDetail1: 'optionalDetailForSkillAdapterToReferenceThisDevice',
        //},
    },
    {
        // This id needs to be unique across all devices discovered for a given manufacturer
        applianceId: 'marantz-sr6010-cable',
        // Company name that produces and sells the smart home device
        manufacturerName: 'Marantz Cable',
        // Model name of the device
        modelName: 'SR6010 Cable',
        // Version number of the product
        version: '1.0',
        // The name given by the user in your application. Examples include 'Bedroom light' etc
        friendlyName: 'Cable',
        // Should describe the device type and the company/cloud provider.
        // This value will be shown in the Alexa app
        friendlyDescription: 'Cable Box via Marantz SR6010',
        // Boolean value to represent the status of the device at time of discovery
        isReachable: true,
        // List the actions the device can support from our API
        // The action should be the name of the actions listed here
        // https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discoverappliancesresponse
        actions: ['turnOn', 'turnOff'],
        // not used at this time
        //additionalApplianceDetails: {
        //    extraDetail1: 'optionalDetailForSkillAdapterToReferenceThisDevice',
        //},
    }
];

/**
 * Utility functions
 */

function log(title, msg) {
    console.log(`[${title}] ${msg}`);
}

/**
 * Generate a unique message ID
 *
 * https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
 * This isn't UUID V4 but it's good enough for what we're doing
 */
function generateMessageID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

/**
 * Generate a response message
 *
 * @param {string} name - Directive name
 * @param {Object} payload - Any special payload required for the response
 * @returns {Object} Response object
 */
function generateResponse(name, payload) {
    return {
        header: {
            messageId: generateMessageID(),
            name: name,
            namespace: 'Alexa.ConnectedHome.Control',
            payloadVersion: '2',
        },
        payload: payload,
    };
}

/**
 * This is a lot easier when I'm just hard-coding my devices
 */
function getDevicesFromPartnerCloud() {
    return USER_DEVICES;
}

function isValidToken() {
    /**
     * Always returns true for sample code.
     * You should update this method to your own access token validation.
     */
    return true;
}

function isDeviceOnline(applianceId) {
    log('DEBUG', `isDeviceOnline (applianceId: ${applianceId})`);

    /**
     * Always returns true in sample code, but that works for us too because we don't care whether it's online or not.
     */
    return true;
}

/**
 * The meat and potatoes, I'm butchering just the things I Need from the solid work done by Nathan Totten:
 * https://github.com/ntotten/marantz-avr/blob/master/lib/avreciever.js
 */
function marantzAPI(commands) {
    log('DEBUG', `MarantzAPI Invoked: ` + JSON.stringify(commands));
    var postData = {};
    
    // format commands for the Marantz POST (cmd0: cmd1: etc)
    // note: may need to send commands one at a time??
    for (var i=0; i<commands.length; i++) {
        postData['cmd' + i] = commands[i];
    }
    
    log('DEBUG', `MarantzAPI POST Data: ` + qs.stringify(postData));
    
    var serverError = function (e) {
        log('Error', e.message);
        return generateResponse('Server Error', e.message);
    };    
    
    var apiRequest = http.request({
        hostname: process.env.receiverIp,
        path: '/MainZone/index.put.asp',
        port: process.env.receiverPort,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(qs.stringify(postData))
        },
    }, function(response) {
        var dataStream;
        
        response.setEncoding('utf8');

        response.on('data', function (chunk) {
            dataStream += chunk;
            log('DEBUG', `CHUNK: ` + chunk);
        });

        response.on('end', function () {
            log('DEBUG', `API Request Complete: ` + dataStream);
            return generateResponse('APIRequestComplete', postData);
        });        

        response.on('error', serverError);
    });  
    
    apiRequest.on('error', serverError);
    apiRequest.write(qs.stringify(postData));
    apiRequest.end();    
}


/* Figure out whether I can use these for volume */
function setPercentage(applianceId, percentage) {
    log('DEBUG', `setPercentage (applianceId: ${applianceId}), percentage: ${percentage}`);

    // Call device cloud's API to set percentage

    return generateResponse('SetPercentageConfirmation', {});
}

function incrementPercentage(applianceId, delta) {
    log('DEBUG', `incrementPercentage (applianceId: ${applianceId}), delta: ${delta}`);

    // Call device cloud's API to set percentage delta

    return generateResponse('IncrementPercentageConfirmation', {});
}

function decrementPercentage(applianceId, delta) {
    log('DEBUG', `decrementPercentage (applianceId: ${applianceId}), delta: ${delta}`);

    // Call device cloud's API to set percentage delta

    return generateResponse('DecrementPercentageConfirmation', {});
}


/**
 * Main logic
 */

/**
 * This function is invoked when we receive a "Discovery" message from Alexa Smart Home Skill.
 * We are expected to respond back with a list of appliances that we have discovered for a given customer.
 *
 * @param {Object} request - The full request object from the Alexa smart home service. This represents a DiscoverAppliancesRequest.
 *     https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discoverappliancesrequest
 *
 * @param {function} callback - The callback object on which to succeed or fail the response.
 *     https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html#nodejs-prog-model-handler-callback
 *     If successful, return <DiscoverAppliancesResponse>.
 *     https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discoverappliancesresponse
 */
function handleDiscovery(request, callback) {
    log('DEBUG', `Discovery Request: ${JSON.stringify(request)}`);

    /**
     * Get the OAuth token from the request.
     */
    const userAccessToken = request.payload.accessToken.trim();

    /**
     * Generic stub for validating the token against your cloud service.
     * Replace isValidToken() function with your own validation.
     */
    if (!userAccessToken || !isValidToken(userAccessToken)) {
        const errorMessage = `Discovery Request [${request.header.messageId}] failed. Invalid access token: ${userAccessToken}`;
        log('ERROR', errorMessage);
        callback(new Error(errorMessage));
    }

    /**
     * Assume access token is valid at this point.
     * Retrieve list of devices from cloud based on token.
     *
     * For more information on a discovery response see
     *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discoverappliancesresponse
     */
    const response = {
        header: {
            messageId: generateMessageID(),
            name: 'DiscoverAppliancesResponse',
            namespace: 'Alexa.ConnectedHome.Discovery',
            payloadVersion: '2',
        },
        payload: {
            discoveredAppliances: getDevicesFromPartnerCloud(userAccessToken),
        },
    };

    /**
     * Log the response. These messages will be stored in CloudWatch.
     */
    log('DEBUG', `Discovery Response: ${JSON.stringify(response)}`);

    /**
     * Return result with successful message.
     */
    callback(null, response);
}

/**
 * A function to handle control events.
 * This is called when Alexa requests an action such as turning off an appliance.
 *
 * @param {Object} request - The full request object from the Alexa smart home service.
 * @param {function} callback - The callback object on which to succeed or fail the response.
 */
function handleControl(request, callback) {
    log('DEBUG', `Control Request: ${JSON.stringify(request)}`);

    /**
     * Get the access token.
     */
    const userAccessToken = request.payload.accessToken.trim();

    /**
     * Generic stub for validating the token against your cloud service.
     * Replace isValidToken() function with your own validation.
     *
     * If the token is invliad, return InvalidAccessTokenError
     *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#invalidaccesstokenerror
     */
    if (!userAccessToken || !isValidToken(userAccessToken)) {
        log('ERROR', `Discovery Request [${request.header.messageId}] failed. Invalid access token: ${userAccessToken}`);
        callback(null, generateResponse('InvalidAccessTokenError', {}));
        return;
    }

    /**
     * Grab the applianceId from the request.
     */
    const applianceId = request.payload.appliance.applianceId;

    /**
     * If the applianceId is missing, return UnexpectedInformationReceivedError
     *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#unexpectedinformationreceivederror
     */
    if (!applianceId) {
        log('ERROR', 'No applianceId provided in request');
        const payload = { faultingParameter: `applianceId: ${applianceId}` };
        callback(null, generateResponse('UnexpectedInformationReceivedError', payload));
        return;
    }

    /**
     * At this point the applianceId and accessToken are present in the request.
     *
     * Please review the full list of errors in the link below for different states that can be reported.
     * If these apply to your device/cloud infrastructure, please add the checks and respond with
     * accurate error messages. This will give the user the best experience and help diagnose issues with
     * their devices, accounts, and environment
     *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#error-messages
     */
    if (!isDeviceOnline(applianceId, userAccessToken)) {
        log('ERROR', `Device offline: ${applianceId}`);
        callback(null, generateResponse('TargetOfflineError', {}));
        return;
    }

    let response;
    var commands = [];
    
    switch (request.header.name) {
        case 'TurnOnRequest':
            // turn on the device
            commands.push('PutZone_OnOff/ON');
            
            // set the input
            switch (applianceId) {
                case 'marantz-sr6010-shield':
                    commands.push('PutZone_InputFunction/MPLAY');
                    break;
                    
                case 'marantz-sr6010-cable':
                    commands.push('PutZone_InputFunction/SAT/CBL');
                    break;
            }
            
            // I guess?  Not even sure if it actually does all this.
            commands.push('aspMainZone_WebUpdateStatus/');
            response = marantzAPI(commands);
            break;

        case 'TurnOffRequest':
            commands.push('PutZone_OnOff/OFF');
            response = marantzAPI(commands);
            break;
        
        
        case 'SetPercentageRequest': {
            const percentage = request.payload.percentageState.value;
            if (!percentage) {
                const payload = { faultingParameter: `percentageState: ${percentage}` };
                callback(null, generateResponse('UnexpectedInformationReceivedError', payload));
                return;
            }
            response = setPercentage(applianceId, userAccessToken, percentage);
            break;
        }

        case 'IncrementPercentageRequest': {
            const delta = request.payload.deltaPercentage.value;
            if (!delta) {
                const payload = { faultingParameter: `deltaPercentage: ${delta}` };
                callback(null, generateResponse('UnexpectedInformationReceivedError', payload));
                return;
            }
            response = incrementPercentage(applianceId, userAccessToken, delta);
            break;
        }

        case 'DecrementPercentageRequest': {
            const delta = request.payload.deltaPercentage.value;
            if (!delta) {
                const payload = { faultingParameter: `deltaPercentage: ${delta}` };
                callback(null, generateResponse('UnexpectedInformationReceivedError', payload));
                return;
            }
            response = decrementPercentage(applianceId, userAccessToken, delta);
            break;
        }
        

        default: {
            log('ERROR', `No supported directive name: ${request.header.name}`);
            callback(null, generateResponse('UnsupportedOperationError', {}));
            return;
        }
    }

    log('DEBUG', `Control Confirmation: ${JSON.stringify(response)}`);

    callback(null, response);
}

/**
 * Main entry point.
 * Incoming events from Alexa service through Smart Home API are all handled by this function.
 *
 * It is recommended to validate the request and response with Alexa Smart Home Skill API Validation package.
 *  https://github.com/alexa/alexa-smarthome-validation
 */
exports.handler = (request, context, callback) => {

    switch (request.header.namespace) {
        /**
         * The namespace of 'Alexa.ConnectedHome.Discovery' indicates a request is being made to the Lambda for
         * discovering all appliances associated with the customer's appliance cloud account.
         *
         * For more information on device discovery, please see
         *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discovery-messages
         */
        case 'Alexa.ConnectedHome.Discovery':
            handleDiscovery(request, callback);
            break;

        /**
         * The namespace of "Alexa.ConnectedHome.Control" indicates a request is being made to control devices such as
         * a dimmable or non-dimmable bulb. The full list of Control events sent to your lambda are described below.
         *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#payload
         */
        case 'Alexa.ConnectedHome.Control':
            handleControl(request, callback);
            break;

        /**
         * The namespace of "Alexa.ConnectedHome.Query" indicates a request is being made to query devices about
         * information like temperature or lock state. The full list of Query events sent to your lambda are described below.
         *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#payload
         *
         * TODO: In this sample, query handling is not implemented. Implement it to retrieve temperature or lock state.
         */
        // case 'Alexa.ConnectedHome.Query':
        //     handleQuery(request, callback);
        //     break;

        /**
         * Received an unexpected message
         */
        default: {
            const errorMessage = `No supported namespace: ${request.header.namespace}`;
            log('ERROR', errorMessage);
            callback(new Error(errorMessage));
        }
    }
};
