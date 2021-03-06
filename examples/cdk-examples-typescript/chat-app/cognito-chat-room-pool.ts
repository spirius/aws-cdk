import cognito = require('@aws-cdk/aws-cognito');
import cdk = require('@aws-cdk/cdk');

export class CognitoChatRoomPool extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    // Create chat room user pool
    const chatPool = new cognito.CfnUserPool(this, 'UserPool', {
      adminCreateUserConfig: {
        allowAdminCreateUserOnly: false
      },
      policies: {
        passwordPolicy: {
          minimumLength: 6,
          requireNumbers: true
        } },
      schema: [
        {
          attributeDataType: 'String',
          name: 'email',
          required: true
        }
      ],
      autoVerifiedAttributes: [ 'email' ]
    });

    // Now for the client
    new cognito.CfnUserPoolClient(this, 'UserPoolClient', {
      clientName: 'Chat-Room',
      explicitAuthFlows: [ 'ADMIN_NO_SRP_AUTH' ],
      refreshTokenValidity: 30,
      userPoolId: chatPool.ref
     });
  }
}
