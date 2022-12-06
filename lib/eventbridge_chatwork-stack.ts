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
import {
  AmazonLinuxCpuType,
  AmazonLinuxGeneration,
  AmazonLinuxImage,
  Instance,
  InstanceType,
  InstanceClass,
  InstanceSize,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';

export class EventbridgeChatworkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // EC2作成
    const vpc = new Vpc(this, 'Vpc', {
      cidr: '10.100.0.0/16',
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'isolated',
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });
    const ami = new AmazonLinuxImage({
      generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
      cpuType: AmazonLinuxCpuType.X86_64,
    });
    const ec2 = new Instance(this, 'sampleInstance', {
      vpc: vpc,
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
      machineImage: ami,
    });
    // CloudWatch Alarm
    const ec2CpuAlarm = new Alarm(this, 'testEC2CpuAlarm', {
      metric: new Metric({
        namespace: 'AWS/EC2',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          // 今回は手動で作成したEC2のIDを直で指定
          InstanceId: ec2.instanceId,
        },
        statistic: 'Average',
        period: Duration.minutes(1),
      }),
      evaluationPeriods: 1,
      threshold: 0.005,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    // const secret = new Secret(this, 'Secret', {
    //   secretName: 'ChatWorkApiKey',
    //   generateSecretString: {
    //     generateStringKey: 'password',
    //     secretStringTemplate: JSON.stringify({
    //       apiKey: process.env.APIKEY ?? '',
    //     }),
    //   },
    // });
    //EventBridge Rule
    const connection = new Connection(this, 'Connection', {
      authorization: Authorization.apiKey(
        'Token if Nedded',
        SecretValue.unsafePlainText('hoge')
        // SecretValue.secretsManager(secret.secretArn, {
        //   jsonField: 'apiKey',
        // })
      ),
      description: 'Connection with API Key Token If Needed',
    });
    // const connection = new Connection(this, 'Connection', {
    //   authorization: Authorization.apiKey(
    //     'X-ChatWorkToken',
    //     SecretValue.secretsManager(secret.secretArn, {
    //       jsonField: 'apiKey',
    //     })
    //   ),
    //   description: 'Connection with API Key X-ChatWorkToken',
    // });
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
          content: `:loudspeaker: アラート :loudspeaker:
アラート名: ${EventField.fromPath('$.detail.alarmName')}
アラート理由: ${EventField.fromPath('$.detail.state.reason')}`,
        }),
      })
    );
  }
}
