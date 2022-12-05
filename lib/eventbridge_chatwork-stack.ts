import * as dotenv from 'dotenv';
dotenv.config();
import * as cdk from 'aws-cdk-lib';
import { Duration, SecretValue } from 'aws-cdk-lib';
import { Alarm, Metric, ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import {
  ApiDestination,
  Authorization,
  Connection,
  EventField,
  HttpParameter,
  Rule,
  RuleTargetInput,
} from 'aws-cdk-lib/aws-events';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class EventbridgeChatworkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // CloudWatch Alarm
    const ec2CpuAlarm = new Alarm(this, 'testEC2CpuAlarm', {
      metric: new Metric({
        namespace: 'AWS/EC2',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          // 今回は手動で作成したEC2のIDを直で指定
          InstanceId: 'i-0a51f37c60f7ba142',
        },
        statistic: 'Average',
        period: Duration.minutes(1),
      }),
      evaluationPeriods: 1,
      threshold: 0.005,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    // ChatWorkのAPIキー
    const secret = new Secret(this, 'Secret', {
      secretName: 'ChatWorkApiKey',
      generateSecretString: {
        generateStringKey: 'password',
        secretStringTemplate: JSON.stringify({
          apiKey: process.env.APIKEY ?? '',
        }),
      },
    });
    //EventBridge Rule
    const connection = new Connection(this, 'Connection', {
      authorization: Authorization.apiKey(
        'X-ChatWorkToken',
        SecretValue.secretsManager(secret.secretArn, {
          jsonField: 'apiKey',
        })
      ),
      description: 'Connection with API Key X-ChatWorkToken',
    });
    const destination = new ApiDestination(this, 'Destination', {
      connection,
      endpoint: process.env.ENDPOINT ?? '',
      description: 'Calling example.com with API key x-api-key',
    });
    const rule = new Rule(this, 'testAlarmRule', {
      ruleName: 'testAlarmRule',
      eventPattern: {
        source: ['aws.cloudwatch'],
        detailType: ['CloudWatch Alarm State Change'],
        resources: [ec2CpuAlarm.alarmArn],
      },
    });
    rule.addTarget(
      new cdk.aws_events_targets.ApiDestination(destination, {
        event: RuleTargetInput.fromObject({
          content: `:loudspeaker:${EventField.fromPath('$.detail.alarmName')}
:new: ${EventField.fromPath('$.detail.state.reason')}`,
        }),
      })
    );
  }
}
